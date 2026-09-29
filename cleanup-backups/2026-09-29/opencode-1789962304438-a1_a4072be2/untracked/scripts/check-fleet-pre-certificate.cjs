'use strict';

/*
 * Merge-chain Fleet PRE exact-SHA certificate gate (Architect dispatch #7, GAP B).
 *
 * Fail-closed: this script returns PASS only when an exact, fresh certificate
 * (verdict READY_FOR_OCEAN) exists for the requested head SHA. Every other
 * outcome — missing source, skipped source, empty cert, SHA mismatch, wrong
 * verdict, stale cert, ambiguous source — is BLOCK and exit code 1.
 *
 * Authoritative cert source: issue #80 comment scan (via gh API) for the marker
 *   [FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<full sha>]
 *   VERDICT=READY_FOR_OCEAN
 *   CERTIFIED_AT=<ISO8601 UTC>
 * Checked-in data/fleet-pre-certificates/<sha>.json is an optional secondary
 * source used only when the authoritative source is unavailable and auto is on.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const DEFAULT_MAX_AGE_HOURS = 24;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const HEX_SHA_RE = /^[0-9a-fA-F]{40}$/;

function clean(value) {
  return String(value || '').replace(/\r\n?/g, '\n');
}

function normalizeSha(value) {
  const sha = clean(value).trim().toLowerCase();
  return HEX_SHA_RE.test(sha) ? sha : null;
}

function parseTimestamp(text) {
  const parsed = Date.parse(clean(text).trim());
  if (Number.isNaN(parsed)) return null;
  const iso = new Date(parsed).toISOString();
  return { ms: parsed, iso };
}

/*
 * Parse the comment body into certificate records. Only the exact marker form
 * is recognized; anything else is not a certificate. A certificate is usable
 * only when it carries VERDICT and a parseable CERTIFIED_AT.
 */
function parseCertificateComment(body) {
  const text = clean(body);
  const records = [];
  const markerRe = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-fA-F]{40})\]/g;
  let match;
  while ((match = markerRe.exec(text)) !== null) {
    const pr = Number(match[1]);
    const sha = match[2].toLowerCase();
    const from = match.index;
    const to = markerRe.lastIndex;
    const block = text.slice(from, to + 4000);
    const verdictMatch = /VERDICT\s*=\s*(READY_FOR_OCEAN|RETURN_TO_BUILDER|UNKNOWN|SKIPPED)/.exec(block);
    const timeMatch = /CERTIFIED_AT\s*=\s*([^\s\r\n]+)/.exec(block);
    if (!verdictMatch || !timeMatch) continue;
    const timestamp = parseTimestamp(timeMatch[1]);
    if (!timestamp) continue;
    if (verdictMatch[1] === 'SKIPPED') continue;
    records.push({ pr, sha, verdict: verdictMatch[1], certifiedAtMs: timestamp.ms, certifiedAt: timestamp.iso });
  }
  return records;
}

function loadCheckedInCertificate(dataDir, sha) {
  if (!sha) return null;
  const file = path.join(dataDir, `${sha}.json`);
  if (!fs.existsSync(file)) return null;
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    return null;
  }
  try {
    const json = JSON.parse(raw.replace(/^\uFEFF/, ''));
    const parsed = {
      pr: Number(json.pr) || 0,
      sha: String(json.exactHeadSha || json.sha || '').toLowerCase(),
      verdict: clean(json.verdict),
    };
    const timestamp = parseTimestamp(json.certifiedAt);
    if (!timestamp) return null;
    parsed.certifiedAtMs = timestamp.ms;
    parsed.certifiedAt = timestamp.iso;
    return parsed;
  } catch (err) {
    return null;
  }
}

/*
 * Pure evaluation. certs is an array of records with { sha, verdict,
 * certifiedAtMs }. Returns { pass, reasons, source }.
 */
function evaluateCertificate({ targetSha, certs = [], maxAgeHours = DEFAULT_MAX_AGE_HOURS, nowMs = Date.now(), preferSource = null }) {
  const reasons = [];
  const normalized = normalizeSha(targetSha);
  if (!normalized) {
    return { pass: false, reasons: [`target SHA is not a valid 40-hex SHA: ${clean(targetSha)}`], source: null };
  }

  const sources = [...new Set(certs.filter((c) => c.sha).map((c) => (c.__source || 'unknown')))];
  if (sources.length === 0) {
    return { pass: false, reasons: ['no certificate source was available'], source: null };
  }
  if (sources.length > 1) {
    return {
      pass: false,
      reasons: [`ambiguous certificate sources: ${sources.join(', ')}`],
      source: null,
    };
  }
  const usedSource = sources[0];

  const matching = certs.filter((c) => c.sha === normalized);
  if (matching.length === 0) {
    const seen = [...new Set(certs.map((c) => c.sha))].slice(0, 3).join(', ');
    return {
      pass: false,
      reasons: [`no certificate for exact head SHA ${normalized}${seen ? ` (present: ${seen})` : ''}`],
      source: usedSource,
    };
  }

  const verdicts = [...new Set(matching.map((c) => c.verdict).filter(Boolean))];
  if (verdicts.length === 0) {
    return { pass: false, reasons: [`certificate for ${normalized} has no verdict`], source: usedSource };
  }
  if (verdicts.length > 1) {
    return {
      pass: false,
      reasons: [`ambiguous verdicts for exact head ${normalized}: ${verdicts.join(', ')}`],
      source: usedSource,
    };
  }
  if (verdicts[0] !== 'READY_FOR_OCEAN') {
    return {
      pass: false,
      reasons: [`unexpected verdict ${verdicts[0]} for exact head ${normalized}; only READY_FOR_OCEAN passes`],
      source: usedSource,
    };
  }

  const latest = Math.max(...matching.map((c) => c.certifiedAtMs));
  if (!Number.isFinite(latest) || latest <= 0) {
    return { pass: false, reasons: [`certificate for ${normalized} has no usable CERTIFIED_AT`], source: usedSource };
  }
  if (latest - nowMs > FUTURE_SKEW_MS) {
    return { pass: false, reasons: [`certificate for ${normalized} is stamped in the future (${new Date(latest).toISOString()})`], source: usedSource };
  }
  const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
  if (nowMs - latest > maxAgeMs) {
    const staleHours = Math.round((nowMs - latest) / (60 * 60 * 1000));
    return {
      pass: false,
      reasons: [`certificate for ${normalized} is stale (${staleHours}h old, max ${maxAgeHours}h)`],
      source: usedSource,
    };
  }

  return {
    pass: true,
    reasons: [`exact fresh READY_FOR_OCEAN certificate for ${normalized}`],
    source: usedSource,
    sha: normalized,
    certifiedAt: new Date(latest).toISOString(),
  };
}

function parseArgs(argv) {
  const out = {
    source: 'auto',
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    issue: '80',
    repo: 'mpaykin1/World_server',
    dataDir: null,
    githubOutput: false,
    commentsFile: null,
  };
  const positional = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    const key = eq >= 0 ? arg.slice(2, eq) : arg.slice(2);
    const value = eq >= 0 ? arg.slice(eq + 1) : argv[i + 1];
    if (key === 'source') out.source = value;
    else if (key === 'max-age-hours') out.maxAgeHours = Number(value);
    else if (key === 'issue') out.issue = value;
    else if (key === 'repo') out.repo = value;
    else if (key === 'data-dir') out.dataDir = value;
    else if (key === 'comments-file') out.commentsFile = value;
    else if (key === 'github-output') out.githubOutput = true;
    else i += 1;
  }
  out.sha = positional[0] || '';
  return out;
}

function githubOutput(result) {
  const lines = [`verdict=${result.pass ? 'READY_FOR_OCEAN' : 'BLOCK'}`];
  lines.push(`source=${result.source || 'none'}`);
  lines.push(`sha=${result.sha || clean(result.reasons.join(' ')).slice(0, 200)}`);
  lines.push(`reason=${clean(result.reasons.join('; ')).replace(/[\r\n]+/g, ' ').slice(0, 400)}`);
  return lines.join('\n');
}

function fetchIssueCommentBodies({ repo, issue }) {
  const args = [
    'api',
    `repos/${repo}/issues/${issue}/comments`,
    '--paginate',
    '--jq',
    '.[].body',
  ];
  const result = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  if (result.status !== 0) {
    return { ok: false, stderr: clean(result.stderr).split('\n').slice(0, 2).join(' ') };
  }
  return { ok: true, text: clean(result.stdout) };
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.sha) {
    process.stderr.write('usage: node scripts/check-fleet-pre-certificate.cjs <sha> [--source=auto|issue-80|checked-in] [--max-age-hours=N] [--issue=N] [--repo=owner/name] [--github-output]\n');
    process.exit(2);
  }

  const maxAgeHours = Number.isFinite(args.maxAgeHours) ? args.maxAgeHours : DEFAULT_MAX_AGE_HOURS;
  const dataDir = args.dataDir || path.join(__dirname, '..', 'data', 'fleet-pre-certificates');
  const records = [];

  let issueReady = false;
  let issueText = '';
  if (args.commentsFile && fs.existsSync(args.commentsFile)) {
    issueReady = true;
    issueText = clean(fs.readFileSync(args.commentsFile, 'utf8'));
  } else if (args.source !== 'checked-in') {
    const fetched = fetchIssueCommentBodies({ repo: args.repo, issue: args.issue });
    if (fetched.ok) {
      issueReady = true;
      issueText = fetched.text;
    }
  }

  const parsedIssue = issueReady ? parseCertificateComment(issueText) : [];
  const checkedIn = loadCheckedInCertificate(dataDir, normalizeSha(args.sha));

  if (args.source === 'issue-80') {
    records.push(...parsedIssue.map((r) => ({ ...r, __source: 'issue-80' })));
    if (!issueReady) {
      process.stderr.write(`BLOCK: authoritative issue #${args.issue} comment source could not be fetched\n`);
      process.exit(1);
    }
  } else if (args.source === 'checked-in') {
    if (checkedIn) {
      records.push({ ...checkedIn, __source: 'checked-in' });
    }
  } else {
    if (issueReady) {
      records.push(...parsedIssue.map((r) => ({ ...r, __source: 'issue-80' })));
    } else if (checkedIn) {
      records.push({ ...checkedIn, __source: 'checked-in' });
    }
  }

  const result = evaluateCertificate({
    targetSha: args.sha,
    certs: records,
    maxAgeHours,
    nowMs: Date.now(),
    preferSource: args.source !== 'auto' ? args.source : null,
  });

  if (args.githubOutput) {
    process.stdout.write(`${githubOutput(result)}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  }

  if (!result.pass) {
    process.stderr.write(`FLEET_PRE: BLOCK — ${result.reasons.join('; ')}\n`);
    process.exit(1);
  }
  process.stdout.write(`FLEET_PRE: PASS — ${result.reasons.join('; ')}\n`);
}

module.exports = {
  parseCertificateComment,
  evaluateCertificate,
  loadCheckedInCertificate,
  normalizeSha,
  githubOutput,
  parseArgs,
  DEFAULT_MAX_AGE_HOURS,
};

if (require.main === module) {
  main();
}