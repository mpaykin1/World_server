'use strict';

// Fleet PRE exact-SHA certificate gate (GAP B close).
//
// Validates a machine-readable Fleet PRE_INTEGRATION_QA certificate for an
// exact PR head SHA and FAILS CLOSED on any of the following:
//   1. no certificate source at all                      -> BLOCK 'no-certificate-source'
//   2. certificate marked skipped / empty                -> BLOCK 'certificate-empty-or-skipped'
//   3. certificate exactHeadSha != requested PR head     -> BLOCK 'exact-head-mismatch'
//   4. certificate verdict != READY_FOR_OCEAN            -> BLOCK 'verdict-not-ready-for-ocean'
//   5. certificate older than max-age (default 24h)      -> BLOCK 'stale-certificate'
//   6. source unavailable or sources disagree (ambiguous)-> BLOCK 'source-unavailable-or-ambiguous'
//   7. exact fresh READY_FOR_OCEAN certificate           -> PASS 'ready-for-ocean'
//
// Authoritative source: issue #80 comment scan for the marker
//   [FLEET][PRE_INTEGRATION_QA][PR_<num>][EXACT_HEAD_<fullsha>]
// containing READY_FOR_OCEAN=YES, fetched via `gh api` (or provided as a JSON
// file with --comments). Optional secondary checked-in source:
// data/fleet-pre-certificates/*.json.
//
// Pure Node, no runtime deps. Validation logic is exported separately from the
// CLI (I/O) wrapper so it can be unit-tested deterministically.

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const SCHEMA = 'fleet-pre-certificate-v1';
const DEFAULT_MAX_AGE_HOURS = 24;
const MARKER_RE = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-f]{40})\]/;
const READY_RE = /READY_FOR_OCEAN\s*=\s*YES/;
const RETURN_RE = /\bRETURN_TO_BUILDER\b/;

function isValidHeadSha(sha) {
  return typeof sha === 'string' && /^[0-9a-f]{40}$/i.test(sha);
}

// Parse one issue comment body into a certificate record, or null when it does
// not carry a Fleet PRE certificate marker.
function parseFleetCertComment(body, createdAt, source) {
  if (typeof body !== 'string' || body.length === 0) return null;
  const m = MARKER_RE.exec(body);
  if (!m) return null;
  let verdict = 'UNSPECIFIED';
  if (READY_RE.test(body)) verdict = 'READY_FOR_OCEAN';
  else if (RETURN_RE.test(body)) verdict = 'RETURN_TO_BUILDER';
  return {
    pr: Number(m[1]),
    exactHeadSha: m[2].toLowerCase(),
    verdict,
    createdAt: createdAt || null,
    skipped: false,
    source: source || 'issue-80',
  };
}

// Parse a gh API responses array (issue comments) into certificate records.
function parseIssueComments(comments, source) {
  const out = [];
  if (!Array.isArray(comments)) return out;
  for (const comment of comments) {
    const cert = parseFleetCertComment(comment && comment.body, comment && comment.created_at, source || 'issue-80');
    if (cert) out.push(cert);
  }
  return out;
}

// Load optional checked-in secondary certificates from data/fleet-pre-certificates.
// Each *.json file is either a single certificate object or an array of them.
function loadDataCerts(dir) {
  const out = [];
  if (!dir || !fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    if (!entry.endsWith('.json')) continue;
    const file = path.join(dir, entry);
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      continue;
    }
    const list = Array.isArray(parsed) ? parsed : [parsed];
    for (const item of list) {
      if (!item || !isValidHeadSha(item.exactHeadSha)) continue;
      let verdict = String(item.verdict || item.status || '').toUpperCase();
      if (verdict !== 'READY_FOR_OCEAN' && verdict !== 'RETURN_TO_BUILDER') verdict = 'UNSPECIFIED';
      out.push({
        pr: Number(item.pr) || 0,
        exactHeadSha: item.exactHeadSha.toLowerCase(),
        verdict,
        createdAt: item.createdAt || item.created_at || item.timestamp || null,
        skipped: item.skipped === true,
        source: `data:${entry}`,
      });
    }
  }
  return out;
}

// Pure fail-closed validation. Returns { verdict, rule, reasons, certificate, sources }.
function validateFleetPreCertificate(certs, opts) {
  const headSha = String((opts && opts.headSha) || '').toLowerCase();
  const now = Number.isFinite(opts && opts.now) ? opts.now : Date.now();
  const maxAgeHours = Number((opts && opts.maxAgeHours) || DEFAULT_MAX_AGE_HOURS);
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  const reasons = [];

  function block(rule, extra) {
    if (extra) reasons.push(extra);
    return { verdict: 'BLOCK', rule, reasons, certificate: null, sources: [] };
  }

  if (!isValidHeadSha(headSha)) {
    return block('exact-head-mismatch', `invalid or missing PR head SHA: ${String(opts && opts.headSha)}`);
  }

  // Rule 1: no certificate source at all.
  if (!Array.isArray(certs) || certs.length === 0) {
    return block('no-certificate-source', 'no Fleet PRE certificate found in any configured source');
  }

  // Rule 3: only certificates for the exact head SHA may count.
  const exact = certs.filter((c) => c && String(c.exactHeadSha).toLowerCase() === headSha);
  if (exact.length === 0) {
    return block('exact-head-mismatch', `no certificate matches exact head ${headSha}`);
  }

  // Rule 2: skipped/empty certificates never pass.
  const usable = exact.filter((c) => !c.skipped && c.verdict !== 'UNSPECIFIED' && c.verdict !== '');
  if (usable.length === 0) {
    return block('certificate-empty-or-skipped', 'only skipped/empty/unspecified certificates exist for this head');
  }

  // Rule 6: ambiguous sources / conflict between independent sources.
  const verdicts = [...new Set(usable.map((c) => c.verdict))];
  if (verdicts.length > 1) {
    return block('source-unavailable-or-ambiguous', `conflicting certificate verdicts ${verdicts.join(',')} for head ${headSha}`);
  }

  // Rule 4: verdict must be READY_FOR_OCEAN.
  if (verdicts[0] !== 'READY_FOR_OCEAN') {
    return block('verdict-not-ready-for-ocean', `certificate verdict is ${verdicts[0]}, expected READY_FOR_OCEAN`);
  }

  // Rule 5: freshness with max-age.
  let latest = usable[0];
  for (const c of usable) {
    const a = latest.createdAt ? new Date(latest.createdAt).getTime() : 0;
    const b = c.createdAt ? new Date(c.createdAt).getTime() : 0;
    if (Number.isFinite(b) && b > a) latest = c;
  }
  const created = latest.createdAt ? new Date(latest.createdAt).getTime() : NaN;
  if (!Number.isFinite(created)) {
    return block('stale-certificate', `certificate for ${headSha} has no usable created timestamp`);
  }
  const ageMs = now - created;
  if (ageMs > maxAgeMs) {
    return block('stale-certificate', `certificate age ${Math.floor(ageMs / 3600000)}h exceeds max-age ${maxAgeHours}h`);
  }

  // Rule 7: exact fresh certificate.
  const sources = [...new Set(usable.map((c) => c.source).filter(Boolean))];
  return {
    verdict: 'READY_FOR_OCEAN',
    rule: 'ready-for-ocean',
    reasons,
    certificate: latest,
    sources,
  };
}

function fetchIssueComments(repo, issue) {
  const r = spawnSync('gh', ['api', `repos/${repo}/issues/${issue}/comments`, '--paginate'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
    windowsHide: true,
  });
  if (r.status !== 0) return { ok: false, error: (r.stderr || r.stdout || 'gh exited non-zero').trim().slice(0, 800) };
  let data;
  try {
    data = JSON.parse(r.stdout);
  } catch (e) {
    return { ok: false, error: `invalid gh JSON output: ${e.message}` };
  }
  return { ok: true, comments: data };
}

function usage() {
  return [
    'Usage: node scripts/check-fleet-pre-certificate.cjs --head <full-sha> [options]',
    'Options:',
    '  --head <full-sha>            exact PR head SHA to certify (required)',
    '  --max-age-hours <n>          certificate freshness window (default 24)',
    '  --comments <path>            issue #80 comments JSON file (gh --paginate output);',
    '                               when omitted, `gh api` is used',
    '  --repo <owner/repo>          repository to scan issue #80 (default mpaykin1/World_server)',
    '  --issue <number>             issue number carrying the canonical ledger (default 80)',
    '  --data-dir <dir>             secondary certificate dir (default data/fleet-pre-certificates)',
    'Exit: 0 on READY_FOR_OCEAN, 1 on BLOCK.',
  ].join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  function valueFor(name) {
    const i = argv.indexOf(name);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : null;
  }
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }
  const head = valueFor('--head');
  const maxAgeHours = Number(valueFor('--max-age-hours')) || DEFAULT_MAX_AGE_HOURS;
  const commentsFile = valueFor('--comments');
  const repo = valueFor('--repo') || 'mpaykin1/World_server';
  const issue = valueFor('--issue') || '80';
  const dataDir = valueFor('--data-dir') || path.resolve(__dirname, '..', 'data', 'fleet-pre-certificates');

  if (!isValidHeadSha(head)) {
    console.error(`FLEET PRE BLOCK: invalid or missing PR head SHA: ${head}`);
    console.error(usage());
    process.exit(1);
  }

  const sources = {
    commentsFile: null,
    gh: null,
    data: [],
  };
  const certs = [];

  if (commentsFile) {
    let raw = null;
    try {
      raw = JSON.parse(fs.readFileSync(commentsFile, 'utf8'));
    } catch (e) {
      sources.commentsFile = `unreadable: ${e.message}`;
    }
    if (raw) {
      const parsed = parseIssueComments(raw);
      if (parsed.length === 0) sources.commentsFile = 'no Fleet PRE marker found';
      else sources.commentsFile = `${parsed.length} certificate(s)`;
      certs.push(...parsed);
    }
  } else {
    const fetched = fetchIssueComments(repo, issue);
    if (!fetched.ok) {
      sources.gh = `unavailable: ${fetched.error}`;
    } else {
      const parsed = parseIssueComments(fetched.comments);
      if (parsed.length === 0) sources.gh = 'no Fleet PRE marker found';
      else sources.gh = `${parsed.length} certificate(s)`;
      certs.push(...parsed);
    }
  }

  const dataCerts = loadDataCerts(dataDir);
  if (dataCerts.length > 0) sources.data = `${dataCerts.length} certificate(s)`;
  certs.push(...dataCerts);

  const result = validateFleetPreCertificate(certs, { headSha: head, maxAgeHours });

  const summary = {
    headSha: head,
    maxAgeHours,
    verdict: result.verdict,
    rule: result.rule,
    certificate: result.certificate ? {
      exactHeadSha: result.certificate.exactHeadSha,
      verdict: result.certificate.verdict,
      createdAt: result.certificate.createdAt,
      source: result.certificate.source,
    } : null,
    sources,
  };
  console.log(`FLEET PRE ${result.verdict === 'READY_FOR_OCEAN' ? 'PASS' : 'BLOCK'}: ${result.rule}`);
  console.log(JSON.stringify(summary, null, 2));
  if (result.reasons.length) {
    for (const reason of result.reasons) console.error(`  - ${reason}`);
  }
  process.exit(result.verdict === 'READY_FOR_OCEAN' ? 0 : 1);
}

module.exports = {
  SCHEMA,
  DEFAULT_MAX_AGE_HOURS,
  MARKER_RE,
  isValidHeadSha,
  parseFleetCertComment,
  parseIssueComments,
  loadDataCerts,
  validateFleetPreCertificate,
};

if (require.main === module) {
  main();
}