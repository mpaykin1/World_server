'use strict';

/**
 * Fleet PRE exact-SHA certificate gate.
 *
 * Machine-enforceable merge-chain control: a PR into `master` may only be
 * mergeable when an independent Fleet PRE_INTEGRATION_QA certificate exists
 * that names the EXACT PR head SHA and carries verdict READY_FOR_OCEAN=YES,
 * posted no more than `max-age` ago.
 *
 * Sources (both parsed deterministically):
 *   primary (authoritative) : issue <--issue> comment scan for the marker
 *       [FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<fullsha>]
 *       containing READY_FOR_OCEAN=YES, fetched via `gh` (GH_TOKEN).
 *   secondary (optional)    : checked-in <data-dir>/*.json schema
 *       fleet-pre-certificate-v1 with {pr, exactHeadSha, verdict, certifiedAt}.
 *
 * FAIL-CLOSED. A BLOCK is the default outcome whenever no exact fresh
 * READY_FOR_OCEAN certificate can be proven. There is no fallback-green path.
 *
 * Exit codes: 0 = PASS (exact fresh cert), 1 = BLOCK, 2 = usage error.
 *
 * Pure logic lives in the exported functions (no I/O); I/O is isolated in
 * gatherSourceCerts() / main() run only when this file is executed directly.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const MARKER_RE = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_([0-9]+)\]\[EXACT_HEAD_([0-9a-fA-F]{40})\]/g;
const DEFAULT_ISSUE = 80;
const DEFAULT_MAX_AGE_HOURS = 24;
const CERT_SCHEMA = 'fleet-pre-certificate-v1';

/** Deterministically read the verdict token from a certificate text block. */
function detectVerdict(text) {
  if (typeof text !== 'string' || !text.trim()) return 'EMPTY';
  if (/READY_FOR_OCEAN\s*=\s*(YES|TRUE)/i.test(text)) return 'READY_FOR_OCEAN';
  if (/READY_FOR_OCEAN\s*=\s*SKIPPED/i.test(text)) return 'SKIPPED';
  if (text.toLowerCase().includes('skipped')) return 'SKIPPED';
  if (/RETURN_TO_BUILDER/i.test(text)) return 'RETURN_TO_BUILDER';
  return 'EMPTY';
}

/**
 * Parse every cert marker found in a text block into normalized cert records.
 * meta = { source, timestampMs }. One marker per (pr, headSha) per block.
 */
function parseCertsFromText(text, meta) {
  const certs = [];
  if (typeof text !== 'string' || !text) return certs;
  const seen = new Set();
  for (const m of text.matchAll(MARKER_RE)) {
    const pr = Number(m[1]);
    const headSha = String(m[2]).toLowerCase();
    const key = `${pr}:${headSha}`;
    if (seen.has(key)) continue;
    seen.add(key);
    certs.push({
      pr,
      headSha,
      verdict: detectVerdict(text),
      source: (meta && meta.source) || 'unknown',
      timestampMs: meta && meta.timestampMs != null ? meta.timestampMs : Date.now()
    });
  }
  return certs;
}

/** Normalize a checked-in data certificate JSON blob into a cert record. */
function normalizeSecondaryCert(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.schema !== CERT_SCHEMA) return null;
  const pr = Number(obj.pr);
  const headSha = String(obj.exactHeadSha || '').toLowerCase();
  if (!Number.isFinite(pr) || !/^[0-9a-f]{40}$/.test(headSha)) return null;
  const certifiedAt = Date.parse(obj.certifiedAt);
  if (!Number.isFinite(certifiedAt)) return null;
  const verdict = typeof obj.verdict === 'string' ? obj.verdict : detectVerdict(JSON.stringify(obj));
  return {
    pr,
    headSha,
    verdict,
    source: 'data/fleet-pre-certificates/',
    timestampMs: certifiedAt
  };
}

/**
 * Evaluate a set of cert candidates against the requested head/pr.
 * Returns { state: 'PASS'|'BLOCK', reasons: string[], detail?: object }.
 *
 * Fail-closed rules:
 *   no-source            : no cert candidates at all
 *   head-sha-mismatch    : no candidate names the requested PR head SHA
 *   skipped              : an exact-head candidate was explicitly skipped
 *   empty                : an exact-head candidate carries no verdict at all
 *   verdict-mismatch     : no exact-head candidate is READY_FOR_OCEAN
 *   ambiguous            : conflicting verdicts exist for the exact head
 *   stale                : freshest READY_FOR_OCEAN cert older than max-age
 */
function evaluateFleetPreCertificate({ headSha, pr, certs, nowMs, maxAgeMs }) {
  const reasons = [];
  const requested = String(headSha || '').toLowerCase();
  const certList = Array.isArray(certs) ? certs : [];

  if (!requested || !/^[0-9a-f]{40}$/.test(requested)) {
    reasons.push('invalid-head-sha');
    return { state: 'BLOCK', reasons };
  }
  if (certList.length === 0) {
    reasons.push('no-source');
    return { state: 'BLOCK', reasons };
  }

  const exact = certList.filter(
    (c) =>
      c &&
      c.headSha === requested &&
      (pr == null || Number(c.pr) === Number(pr))
  );
  if (exact.length === 0) {
    reasons.push('head-sha-mismatch');
    reasons.push('certificate-must-match-the-exact-PR-head-SHA');
    return { state: 'BLOCK', reasons };
  }

  const verdicts = exact.map((c) => c.verdict || 'EMPTY');
  if (verdicts.some((v) => v === 'SKIPPED')) {
    reasons.push('skipped');
    return { state: 'BLOCK', reasons };
  }
  if (verdicts.some((v) => v === 'EMPTY')) {
    reasons.push('empty');
    return { state: 'BLOCK', reasons };
  }

  const uniqueVerdicts = Array.from(new Set(verdicts));
  if (uniqueVerdicts.length > 1 || !uniqueVerdicts.includes('READY_FOR_OCEAN')) {
    reasons.push('ambiguous');
    reasons.push('conflicting-verdicts-for-exact-head');
    return { state: 'BLOCK', reasons };
  }

  const ready = exact.filter((c) => c.verdict === 'READY_FOR_OCEAN');
  ready.sort((a, b) => (b.timestampMs || 0) - (a.timestampMs || 0));
  const freshest = ready[0];
  if (!freshest || !Number.isFinite(freshest.timestampMs)) {
    reasons.push('stale');
    reasons.push('no-verifiable-certificate-timestamp');
    return { state: 'BLOCK', reasons };
  }

  const maxAge = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : DEFAULT_MAX_AGE_HOURS * 3600 * 1000;
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  if (now - freshest.timestampMs > maxAge) {
    reasons.push('stale');
    reasons.push('certificate-older-than-max-age');
    return { state: 'BLOCK', reasons };
  }

  reasons.push('exact-fresh-cert');
  return { state: 'PASS', reasons, detail: { pr: freshest.pr, headSha: freshest.headSha, source: freshest.source, timestampMs: freshest.timestampMs } };
}

function parseArgv(argv) {
  const args = { headSha: '', pr: null, issue: DEFAULT_ISSUE, maxAgeHours: DEFAULT_MAX_AGE_HOURS, dataDir: 'data/fleet-pre-certificates' };
  for (const a of argv || []) {
    if (a.startsWith('--head-sha=')) args.headSha = a.slice('--head-sha='.length);
    else if (a.startsWith('--pr=')) args.pr = Number(a.slice('--pr='.length));
    else if (a.startsWith('--issue=')) args.issue = Number(a.slice('--issue='.length));
    else if (a.startsWith('--max-age-hours=')) args.maxAgeHours = Number(a.slice('--max-age-hours='.length));
    else if (a.startsWith('--data-dir=')) args.dataDir = a.slice('--data-dir='.length);
    else if (!args.headSha && /^[0-9a-fA-F]{40}$/.test(a)) args.headSha = a;
  }
  if (!Number.isFinite(args.pr) || args.pr <= 0) args.pr = null;
  if (!Number.isFinite(args.issue) || args.issue <= 0) args.issue = DEFAULT_ISSUE;
  if (!Number.isFinite(args.maxAgeHours) || args.maxAgeHours <= 0) args.maxAgeHours = DEFAULT_MAX_AGE_HOURS;
  return args;
}

/** I/O only: fetch issue comments via gh and read the optional data dir. */
function gatherSourceCerts({ issue, dataDir }) {
  const certs = [];
  const diagnostics = [];
  const gh = spawnSync('gh', ['issue', 'view', String(issue), '--json', 'comments'], {
    encoding: 'utf8',
    timeout: 60000,
    env: Object.assign({}, process.env, { GH_TOKEN: process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '' })
  });
  if (gh.status === 0) {
    try {
      const payload = JSON.parse(gh.stdout);
      for (const comment of payload.comments || []) {
        const blockCerts = parseCertsFromText(comment.body || '', {
          source: `issue#${issue}`,
          timestampMs: Date.parse(comment.createdAt)
        });
        certs.push(...blockCerts);
      }
      diagnostics.push(`issue#${issue}: comments scanned`);
    } catch (e) {
      diagnostics.push(`issue#${issue}: parse failure (${e.message})`);
    }
  } else {
    diagnostics.push(`issue#${issue}: gh unavailable/failed (rc=${gh.status || 'spawn-error'})`);
  }

  const dir = path.resolve(dataDir);
  if (fs.existsSync(dir)) {
    let files = [];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
    } catch (_) {
      files = [];
    }
    for (const f of files) {
      try {
        const parsed = normalizeSecondaryCert(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
        if (parsed) certs.push(parsed);
      } catch (_) {
        diagnostics.push(`data file ignored: ${f}`);
      }
    }
    diagnostics.push(`data-dir: ${files.length} json file(s) considered`);
  } else {
    diagnostics.push(`data-dir: absent ${dataDir}`);
  }

  return { certs, diagnostics };
}

function main(argv) {
  const args = parseArgv(argv);
  if (!args.headSha) {
    process.stderr.write('usage: node scripts/check-fleet-pre-certificate.cjs --head-sha=<full.sha> [--pr=<n>] [--issue=80] [--max-age-hours=24] [--data-dir=data/fleet-pre-certificates]\n');
    process.exit(2);
  }
  const { certs, diagnostics } = gatherSourceCerts({ issue: args.issue, dataDir: args.dataDir });
  const result = evaluateFleetPreCertificate({
    headSha: args.headSha,
    pr: args.pr,
    certs,
    nowMs: Date.now(),
    maxAgeMs: args.maxAgeHours * 3600 * 1000
  });
  for (const d of diagnostics) console.log(`[FLEET_PRE_CERT] ${d}`);
  console.log(`[FLEET_PRE_CERT] sha=${args.headSha} pr=${args.pr || '-'} certs=${certs.length}`);
  if (result.state === 'PASS') {
    console.log(`[FLEET_PRE_CERT] PASS (${result.detail.source}, certifiedAt=${new Date(result.detail.timestampMs).toISOString()})`);
    return 0;
  }
  console.error(`[FLEET_PRE_CERT] BLOCK: ${result.reasons.join(' | ')}`);
  return 1;
}

module.exports = {
  MARKER_RE,
  CERT_SCHEMA,
  DEFAULT_ISSUE,
  DEFAULT_MAX_AGE_HOURS,
  detectVerdict,
  parseCertsFromText,
  normalizeSecondaryCert,
  evaluateFleetPreCertificate,
  parseArgv,
  gatherSourceCerts,
  main
};

if (require.main === module) {
  const code = main(process.argv.slice(2));
  process.exit(code);
}