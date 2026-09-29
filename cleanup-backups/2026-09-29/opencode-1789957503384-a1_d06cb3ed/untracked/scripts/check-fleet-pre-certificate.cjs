#!/usr/bin/env node
'use strict';

/**
 * Fleet PRE merge-chain gate — fail-closed exact-SHA independent authorization.
 *
 * A merge into `master` is only allowed when an *independent* Fleet
 * PRE_INTEGRATION_QA certificate exists for the EXACT PR head SHA. This script
 * validates that certificate. Every weak/ambiguous/missing/stale/mismatched
 * state is a BLOCK (exit 1). Only a fresh, exact, machine-readable
 * `READY_FOR_OCEAN=YES` certificate for the exact head SHA is a PASS (exit 0).
 *
 * Certificate sources (both deterministic):
 *   1. Authoritative primary: issue #80 comment scan via `gh api` for the marker
 *      `[FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<fullsha>]` containing
 *      `READY_FOR_OCEAN=YES`.
 *   2. Optional secondary: checked-in `data/fleet-pre-certificates/<sha>.json`.
 *
 * Both unavailable or ambiguous => BLOCK. Pure validation logic is separated
 * from I/O so every fail-closed rule is unit-testable offline without any
 * runtime dependency.
 *
 * Usage:
 *   node scripts/check-fleet-pre-certificate.cjs <exact-head-sha> \
 *        [--pr <pr-number>] [--max-age <ms>] [--repo <owner/repo>] \
 *        [--issue80 <comments.json>] [--quiet]
 *
 * Environment overrides:
 *   FLEET_REPO, FLEET_MAX_AGE_MS, FLEET_ISSUE80_COMMENTS, FLEET_CERT_ROOT
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ACCEPT_VERDICT = 'READY_FOR_OCEAN';
const ACCEPT_MARKER = 'READY_FOR_OCEAN=YES';
const SHA_RE = /^[0-9a-f]{40}$/i;
const MARKER_RE = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-f]{40})\]/i;
const VERDICT_RE = /READY_FOR_OCEAN\s*=\s*(YES|NO)/i;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DEFAULT_REPO = 'mpaykin1/World_server';
const ISSUE_80 = 80;
const PAGE_SIZE = 100;
const MAX_PAGES = 100;

const CODES = {
  NO_SOURCE: 'NO_SOURCE',
  SKIPPED_OR_EMPTY: 'SKIPPED_OR_EMPTY',
  SHA_MISMATCH: 'SHA_MISMATCH',
  VERDICT_NOT_READY: 'VERDICT_NOT_READY',
  STALE: 'STALE',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  AMBIGUOUS: 'AMBIGUOUS',
  PASS: 'PASS',
};

function normalizeSha(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function isSha(value) {
  return SHA_RE.test(value);
}

function block(code, reasons) {
  return { ok: false, status: 'BLOCK', code, reasons: [].concat(reasons), cert: null };
}

function pass(cert) {
  return { ok: true, status: 'PASS', code: CODES.PASS, reasons: [], cert };
}

/**
 * Parse machine-readable Fleet PRE certificates from issue #80 comment objects.
 * Accepts the deterministic shape returned by `gh api .../issues/80/comments`.
 * Comments without the exact marker contribute nothing (fail-closed).
 */
function parseIssueComments(comments) {
  const certs = [];
  if (!Array.isArray(comments)) return certs;
  for (const comment of comments) {
    if (!comment || typeof comment !== 'object') continue;
    const body = String(comment.body || '').replace(/^\uFEFF/, '');
    if (!body.trim()) continue;
    const markers = body.matchAll(MARKER_RE);
    let matched = false;
    for (const m of markers) {
      matched = true;
      const verdictMatch = body.match(VERDICT_RE);
      const issuedAt = Date.parse(comment.created_at || comment.createdAt || '');
      certs.push({
        source: 'issue80',
        pr: Number(m[1]),
        exactHeadSha: normalizeSha(m[2]),
        verdict: verdictMatch ? `READY_FOR_OCEAN=${verdictMatch[1].toUpperCase()}` : null,
        verdictReady: verdictMatch ? verdictMatch[1].toUpperCase() === 'YES' : false,
        issuedAt: Number.isFinite(issuedAt) ? issuedAt : 0,
        commentId: comment.id != null ? Number(comment.id) : null,
      });
    }
    if (matched) break;
  }
  return certs;
}

/**
 * Parse an optional checked-in certificate file.
 * Returns { ok:true, cert } or { ok:false, error }.
 */
function parseCheckedInCert(text, expectSha) {
  if (!text || !String(text).trim()) return { ok: false, error: 'empty' };
  let data;
  try {
    data = JSON.parse(String(text).replace(/^\uFEFF/, ''));
  } catch {
    return { ok: false, error: 'invalid-json' };
  }
  if (!data || typeof data !== 'object') return { ok: false, error: 'invalid-object' };
  if (String(data.status || '').toUpperCase() === 'SKIPPED') return { ok: false, error: 'skipped' };
  const sha = normalizeSha(data.exactHeadSha);
  const cert = {
    source: data.source || 'checked-in',
    pr: data.pr != null ? Number(data.pr) : null,
    exactHeadSha: sha,
    verdict: data.verdict || null,
    verdictReady: normalizeSha(data.verdict) === normalizeSha(ACCEPT_MARKER),
    issuedAt: Date.parse(data.issuedAt || ''),
    file: data.file || null,
  };
  if (!isSha(sha)) return { ok: false, error: 'invalid-sha', cert };
  if (expectSha && sha !== normalizeSha(expectSha)) return { ok: false, error: 'sha-mismatch', cert };
  if (!Number.isFinite(cert.issuedAt)) return { ok: false, error: 'invalid-issuedAt', cert };
  if (data.type !== 'fleet-pre-qa-certificate') return { ok: false, error: 'invalid-type', cert };
  return { ok: true, cert };
}

/**
 * Pure fail-closed evaluation.
 *
 * @param {object} opts
 * @param {string} opts.exactHeadSha       4x40-hex PR head SHA to certify.
 * @param {number} [opts.maxAgeMs]         certificate freshness window.
 * @param {number} [opts.now]              reference "now" in epoch ms.
 * @param {Array}  [opts.certs]            certificates collected from sources.
 * @param {number} [opts.pr]               expected PR number (optional hard check).
 * @param {boolean} [opts.sourceError]     primary authoritative source unreachable.
 * @param {boolean} [opts.sourceEmpty]     authoritative source produced no candidates.
 */
function evaluate({ exactHeadSha, maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now(), certs = [], pr, sourceError = false, sourceEmpty = false }) {
  const head = normalizeSha(exactHeadSha);
  if (!isSha(head)) {
    return block(CODES.SHA_MISMATCH, [`exact PR head SHA must be 40 hex chars; got '${exactHeadSha}'`]);
  }
  const validCerts = (certs || []).filter((c) => c && typeof c === 'object' && isSha(c.exactHeadSha));
  if (validCerts.length === 0) {
    if (sourceError) return block(CODES.SOURCE_UNAVAILABLE, ['authoritative issue #80 evidence is unreachable and no usable certificate source exists']);
    if (sourceEmpty) return block(CODES.SKIPPED_OR_EMPTY, ['certificate source was empty/skipped; no candidate certificate exists']);
    return block(CODES.NO_SOURCE, ['no Fleet PRE certificate found from any available source']);
  }
  const matching = validCerts.filter((c) => c.exactHeadSha === head);
  if (matching.length === 0) {
    const found = [...new Set(validCerts.map((c) => c.exactHeadSha))].slice(0, 8).join(', ');
    return block(CODES.SHA_MISMATCH, [`no Fleet PRE certificate for exact head ${head}; found certs for: ${found}`]);
  }
  const seen = new Set();
  const unique = matching.filter((c) => {
    const key = `${c.source}:${c.pr == null ? '' : c.pr}:${c.exactHeadSha}:${c.verdict || ''}:${c.issuedAt}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const verdicts = new Set(unique.map((c) => c.verdict || '').filter(Boolean));
  if (verdicts.size > 1) {
    return block(CODES.AMBIGUOUS, [`conflicting Fleet PRE verdicts for exact head ${head}: ${[...verdicts].join(' | ')}`]);
  }
  if (pr != null) {
    const prs = new Set(unique.map((c) => c.pr).filter((p) => p != null));
    if (prs.size > 1) {
      return block(CODES.AMBIGUOUS, [`certificates for exact head ${head} reference multiple PRs: ${[...prs].join(', ')}`]);
    }
  }
  const cert = unique[0];
  if (!cert) return block(CODES.SKIPPED_OR_EMPTY, ['no usable certificate for exact head']);
  if (!cert.verdictReady || cert.verdict !== ACCEPT_MARKER) {
    return block(CODES.VERDICT_NOT_READY, [`Fleet PRE verdict for ${head} is not ${ACCEPT_MARKER} (got ${cert.verdict || 'no verdict'})`]);
  }
  if (!Number.isFinite(cert.issuedAt) || cert.issuedAt <= 0) {
    return block(CODES.SKIPPED_OR_EMPTY, ['certificate for exact head has no usable issued time']);
  }
  if (now - cert.issuedAt > maxAgeMs) {
    const ageMin = Math.round((now - cert.issuedAt) / 60000);
    const maxMin = Math.max(1, Math.round(maxAgeMs / 60000));
    return block(CODES.STALE, [`Fleet PRE certificate for ${head} is stale (${ageMin} min old > ${maxMin} min max-age)`]);
  }
  return pass(cert);
}

function expectJsonArray(text, what) {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) throw new Error(`${what}: empty`);
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error(`${what}: not a JSON array`);
  return parsed;
}

function execAsync(cmd, args) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}

async function fetchIssue80Certs(repo) {
  const certs = [];
  let page = 1;
  // Loop pages deterministically; stop as soon as a page is shorter than the page size.
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const url = `repos/${repo}/issues/${ISSUE_80}/comments?per_page=${PAGE_SIZE}&page=${page}`;
    const comments = expectJsonArray(await execAsync('gh', ['api', url, '--jq', '.']), 'issue #80 page');
    certs.push(...parseIssueComments(comments));
    if (comments.length < PAGE_SIZE) break;
    page += 1;
    if (page > MAX_PAGES) throw new Error('issue #80 pagination runaway');
  }
  return certs;
}

function certRoot() {
  return path.resolve(process.env.FLEET_CERT_ROOT || path.join(__dirname, '..', 'data', 'fleet-pre-certificates'));
}

function collectCheckedIn(head) {
  const file = path.join(certRoot(), `${head}.json`);
  if (!fs.existsSync(file)) return { certs: [], file: null };
  const parsed = parseCheckedInCert(fs.readFileSync(file, 'utf8'), head);
  return { certs: parsed.ok ? [parsed.cert] : [], file, parsed };
}

function parseArgs(argv) {
  const out = {
    exactHeadSha: String(argv[0] || '').trim(),
    pr: null,
    maxAgeMs: DEFAULT_MAX_AGE_MS,
    repo: process.env.FLEET_REPO || DEFAULT_REPO,
    issue80Path: process.env.FLEET_ISSUE80_COMMENTS || null,
    quiet: false,
  };
  const args = argv.slice(1);
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--pr') out.pr = Number(args[i + 1]);
    else if (a.startsWith('--pr=')) out.pr = Number(a.slice(5));
    else if (a === '--max-age') out.maxAgeMs = Number(args[i + 1]);
    else if (a.startsWith('--max-age=')) out.maxAgeMs = Number(a.slice(10));
    else if (a === '--repo') out.repo = args[i + 1];
    else if (a.startsWith('--repo=')) out.repo = a.slice(7);
    else if (a === '--issue80') out.issue80Path = args[i + 1];
    else if (a.startsWith('--issue80=')) out.issue80Path = a.slice(10);
    else if (a === '--quiet') out.quiet = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

async function loadCandidates({ head, repo, issue80Path }) {
  const notes = [];
  let sourceError = false;
  let sourceEmpty = false;
  let primaryCerts = null;
  if (issue80Path) {
    try {
      primaryCerts = parseIssueComments(expectJsonArray(fs.readFileSync(issue80Path, 'utf8'), 'issue #80 evidence'));
      if (primaryCerts.length === 0) sourceEmpty = true;
    } catch (err) {
      sourceError = true;
      notes.push(`issue #80 evidence unavailable: ${err && err.message}`);
    }
  } else {
    try {
      primaryCerts = await fetchIssue80Certs(repo);
      if (primaryCerts.length === 0) sourceEmpty = true;
    } catch (err) {
      sourceError = true;
      notes.push(`gh issue #80 fetch unavailable: ${err && err.message}`);
    }
  }
  const secondary = collectCheckedIn(head);
  if (secondary.file) {
    if (!secondary.certs.length) notes.push(`checked-in certificate invalid/absent: ${secondary.file}`);
  }
  let candidates;
  if (primaryCerts) {
    candidates = primaryCerts.slice();
    if (primaryCerts.length === 0) candidates = secondary.certs.slice();
  } else {
    candidates = secondary.certs.slice();
  }
  if (candidates.length === 0 && secondary.file) sourceEmpty = true;
  return { candidates, sourceError, sourceEmpty, notes };
}

function formatResult(result, meta) {
  const lines = [
    'Fleet PRE merge-chain certificate gate',
    `  exact head: ${meta.head}`,
    `  verdict: ${result.status}${result.code ? ` (${result.code})` : ''}`,
  ];
  for (const reason of result.reasons || []) lines.push(`  reason: ${reason}`);
  for (const note of meta.notes || []) lines.push(`  note: ${note}`);
  if (result.cert) {
    lines.push(`  cert: ${result.cert.source} PR#${result.cert.pr == null ? '?' : result.cert.pr} ${result.cert.verdict || 'no-verdict'} issued ${new Date(result.cert.issuedAt).toISOString()}`);
  }
  return lines.join('\n');
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.exactHeadSha) {
    console.error('Usage: node scripts/check-fleet-pre-certificate.cjs <exact-head-sha> [--pr <n>] [--max-age <ms>] [--repo <owner/repo>] [--issue80 <comments.json>] [--quiet]');
    process.exit(opts.help ? 0 : 2);
  }
  const head = normalizeSha(opts.exactHeadSha);
  const { candidates, sourceError, sourceEmpty, notes } = await loadCandidates({ head, repo: opts.repo, issue80Path: opts.issue80Path });
  const result = evaluate({
    exactHeadSha: head,
    maxAgeMs: opts.maxAgeMs,
    now: Date.now(),
    certs: candidates,
    pr: opts.pr != null && Number.isFinite(opts.pr) ? opts.pr : null,
    sourceError,
    sourceEmpty,
  });
  const meta = { head, notes };
  if (opts.quiet) {
    console.log(`RESULT:${result.status}:${result.code}`);
  } else {
    console.log(formatResult(result, meta));
    console.log(`RESULT:${result.status}:${result.code}`);
    if (result.cert) {
      console.log(JSON.stringify({ status: result.status, code: result.code, exactHeadSha: head, cert: result.cert, notes }));
    }
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  CODES,
  ACCEPT_VERDICT,
  ACCEPT_MARKER,
  DEFAULT_MAX_AGE_MS,
  isSha,
  normalizeSha,
  block,
  pass,
  parseIssueComments,
  parseCheckedInCert,
  evaluate,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`[fleet-pre-certificate] fatal: ${err && err.stack || err}`);
    process.exit(1);
  });
}