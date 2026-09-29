#!/usr/bin/env node
'use strict';

/**
 * Merge-chain Fleet PRE exact-SHA certificate gate.
 *
 * Closes GAP B of the world-server control plane: Ocean integration may only
 * proceed when an unambiguous Fleet PRE certificate states READY_FOR_OCEAN for
 * the EXACT final PR HEAD_SHA. This checker is fail-closed:
 *   - exit 0  => FLEET_PRE_CERT_PASS  (a fresh exact-SHA ready certificate exists)
 *   - exit 1  => FLEET_PRE_CERT_BLOCK (anything else: missing, skipped, stale,
 *                mismatched SHA, non-ready verdict, ambiguous/unavailable source,
 *                or canonical hash mismatch)
 *
 * Authority model (see data/fleet-pre-certificates/README.md):
 *   - --source issues (default, CI-authoritative): scan public issue #80 for a
 *     `[FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<40hex>]` comment carrying
 *     READY_FOR_OCEAN=YES / PRE_VERDICT=READY_FOR_OCEAN. Fleet comments can only
 *     be posted by a repository collaborator, so they cannot be forged by a PR
 *     author (unlike a checked-in file).
 *   - --source file (deterministic offline validation ONLY, never CI): read
 *     data/fleet-pre-certificates/<sha>.json and check its canonical sha256.
 *   The two sources never fall back to each other: the requested source must
 *   answer, otherwise the gate blocks.
 *
 * Pure functions are exported for offline tests (test/fleet-pre-certificate.test.js).
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CERTIFICATE_NAME = 'FLEET_PRE';
const ACCEPTED_VERDICT = 'READY_FOR_OCEAN';
const DEFAULT_MAX_AGE_HOURS = 24;
const DEFAULT_ISSUE = 80;
const HEX40 = /^[0-9a-f]{40}$/;

const COMMENT_HEADING = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-fA-F]{40})\]/;
const READY_PATTERNS = [
  /READY_FOR_OCEAN=YES\b/,
  /\bPRE_VERDICT=READY_FOR_OCEAN\b/,
  /\bVERDICT[\s:=]+READY_FOR_OCEAN\b/
];

function normalizeSha(sha) {
  if (typeof sha !== 'string') return null;
  return sha.trim().toLowerCase();
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(String(input)).digest('hex');
}

/**
 * Deterministic canonical serialization: sorted keys, empty/null/undefined
 * dropped, canonical field excluded. Used to compute / verify cert integrity.
 */
function canonicalJson(obj) {
  const clone = Object.assign({}, obj);
  delete clone.canonical;
  const sorted = {};
  for (const key of Object.keys(clone).sort()) {
    const value = clone[key];
    if (value === undefined || value === null || value === '') continue;
    sorted[key] = value;
  }
  return JSON.stringify(sorted);
}

function formatIssuedCert(cert) {
  return sha256Hex(canonicalJson(cert || {}));
}

function parseCommentCert(comment) {
  if (!comment || typeof comment !== 'object') return null;
  const body = String(comment.body || '');
  const match = body.match(COMMENT_HEADING);
  if (!match) return null;
  const pr = Number(match[1]);
  const exactHeadSha = normalizeSha(match[2]);
  if (!HEX40.test(exactHeadSha)) return null;
  const ready = READY_PATTERNS.some((pattern) => pattern.test(body));
  return {
    certificate: CERTIFICATE_NAME,
    schemaVersion: 1,
    pr,
    exactHeadSha,
    verdict: ready ? ACCEPTED_VERDICT : 'NOT_READY_FOR_OCEAN',
    verifiedAt: comment.created_at || '',
    source: 'issue80',
    sourceCommentId: comment.id || null,
    sourceCommentAt: comment.created_at || ''
  };
}

/**
 * Deterministically pick the newest matching certificate. Newest created_at
 * wins; id breaks exact-date ties. A newer non-ready Fleet comment therefore
 * supersedes an older ready one (a Fleet veto wins).
 */
function selectCert(parsedCerts, { pr, headSha }) {
  const targetSha = normalizeSha(headSha);
  const matches = (parsedCerts || [])
    .filter((cert) => cert && cert.certificate === CERTIFICATE_NAME &&
      cert.exactHeadSha === targetSha && Number(cert.pr) === Number(pr))
    .sort((a, b) => {
      const ta = new Date(a.sourceCommentAt).getTime();
      const tb = new Date(b.sourceCommentAt).getTime();
      if (ta !== tb) return tb - ta;
      return (b.sourceCommentId || 0) - (a.sourceCommentId || 0);
    });
  return matches.length > 0 ? matches[0] : null;
}

function certsFromComments(comments) {
  return (comments || []).map(parseCommentCert).filter(Boolean);
}

/**
 * 7 fail-closed rules + happy path.
 * Returns { ok: boolean, reasons: string[], cert }.
 */
function validateCert(cert, options) {
  const opts = options || {};
  const headSha = normalizeSha(opts.headSha);
  const pr = Number(opts.pr);
  const maxAgeMs = opts.maxAgeMs || DEFAULT_MAX_AGE_HOURS * 60 * 60 * 1000;
  const now = opts.now || Date.now();
  const reasons = [];

  if (!cert || typeof cert !== 'object') {
    return { ok: false, reasons: ['no_cert'], cert: cert || null };
  }
  if (cert.certificate !== CERTIFICATE_NAME) reasons.push('invalid_certificate_name');
  if (!cert.exactHeadSha || typeof cert.exactHeadSha !== 'string') reasons.push('missing_exact_head_sha');
  if (!cert.verdict || typeof cert.verdict !== 'string') reasons.push('empty_verdict');
  if (!cert.verifiedAt || !cert.verifiedAt.trim()) reasons.push('missing_verified_at');
  if (pr > 0 && cert.pr !== undefined && Number(cert.pr) !== pr) reasons.push('pr_mismatch');

  if (cert.exactHeadSha) {
    const certSha = normalizeSha(cert.exactHeadSha);
    if (!HEX40.test(certSha)) reasons.push('malformed_exact_head_sha');
    else if (normalizeSha(headSha) !== certSha) reasons.push('head_sha_mismatch');
  }

  if (cert.verdict && cert.verdict !== ACCEPTED_VERDICT) reasons.push('verdict_not_ready_for_ocean');

  if (cert.verifiedAt) {
    const verified = new Date(cert.verifiedAt).getTime();
    if (!Number.isFinite(verified)) reasons.push('invalid_verified_at');
    else if (now - verified > maxAgeMs) reasons.push('stale_certificate');
  }

  // Canonical integrity. For file certificates the `canonical` field is
  // mandatory and must match. Issue-comment certificates are anchored by
  // GitHub comment identity, so self-consistency is verified instead.
  if (opts.requireCanonical) {
    const expected = typeof cert.canonical === 'string' ? cert.canonical.trim().toLowerCase() : '';
    if (!expected) reasons.push('missing_canonical');
    else if (formatIssuedCert(cert) !== expected) reasons.push('canonical_mismatch');
  } else if (cert.canonical !== undefined) {
    if (formatIssuedCert(cert) !== String(cert.canonical).trim().toLowerCase()) reasons.push('canonical_mismatch');
  }

  return { ok: reasons.length === 0, reasons, cert };
}

function block(reason, extra) {
  const parts = [`FLEET_PRE_CERT_BLOCK`, `reason=${reason}`];
  if (extra && typeof extra === 'object') {
    if (extra.head) parts.push(`head=${extra.head}`);
    if (extra.pr) parts.push(`pr=${extra.pr}`);
    if (extra.source) parts.push(`source=${extra.source}`);
    if (extra.verifiedAt) parts.push(`verifiedAt=${extra.verifiedAt}`);
    if (extra.ageHours !== undefined) parts.push(`ageHours=${Number(extra.ageHours).toFixed(2)}`);
  }
  console.log(parts.join(' '));
  return 1;
}

function pass(cert, source, ageHours) {
  console.log([
    'FLEET_PRE_CERT_PASS',
    `head=${cert.exactHeadSha}`,
    `pr=${cert.pr}`,
    `verdict=${cert.verdict}`,
    `verifiedAt=${cert.verifiedAt || ''}`,
    `source=${source}`,
    `ageHours=${Number(ageHours).toFixed(2)}`
  ].join(' '));
  return 0;
}

async function fetchComments(args) {
  const url = `https://api.github.com/repos/${encodeURIComponent(args.owner)}/${encodeURIComponent(args.repo)}/issues/${Number(args.issue)}/comments?per_page=100&direction=desc`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'world-server-fleet-pre-certificate-gate',
    'X-GitHub-Api-Version': '2022-11-28'
  };
  if (args.token) headers.Authorization = `Bearer ${args.token}`;
  let response;
  try {
    response = await fetch(url, { headers });
  } catch (error) {
    return { error: `source_unavailable_network:${error.code || error.message}`, comments: [] };
  }
  if (response.status === 401) return { error: 'source_unavailable_unauthorized', comments: [] };
  if (response.status === 403) return { error: 'source_unavailable_forbidden', comments: [] };
  if (response.status === 404) return { error: 'source_unavailable_404', comments: [] };
  if (!response.ok) return { error: `source_unavailable_http_${response.status}`, comments: [] };
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { error: 'source_unavailable_unparseable', comments: [] };
  }
  if (!Array.isArray(payload)) return { error: 'source_unavailable_invalid_shape', comments: [] };
  return { error: null, comments: payload };
}

function parseArgs(argv) {
  const args = {
    source: 'issues',
    owner: 'mpaykin1',
    repo: 'World_server',
    issue: DEFAULT_ISSUE,
    maxAgeHours: DEFAULT_MAX_AGE_HOURS,
    sha: null,
    pr: null,
    token: null,
    certFile: null,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => argv[++i];
    switch (arg) {
      case '--sha': args.sha = next(); break;
      case '--pr': args.pr = Number(next()); break;
      case '--source': args.source = next(); break;
      case '--owner': args.owner = next(); break;
      case '--repo': args.repo = next(); break;
      case '--issue': args.issue = Number(next()); break;
      case '--max-age-hours': args.maxAgeHours = Number(next()); break;
      case '--token': args.token = next(); break;
      case '--cert-file': args.certFile = next(); break;
      case '--help':
      case '-h': args.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function usage() {
  console.log(`Usage: node scripts/check-fleet-pre-certificate.cjs [options]

  --sha <40hex>          PR head SHA to certify (required)
  --pr <number>          PR number (required)
  --source <issues|file> Authority source (default: issues; file = offline tests only)
  --owner <login>        Repo owner for issue source (default: mpaykin1)
  --repo <name>          Repo name for issue source (default: World_server)
  --issue <number>       Issue to scan (default: 80)
  --token <token>        GitHub token (default: env GITHUB_TOKEN)
  --max-age-hours <n>    Certificate freshness limit in hours (default: 24)
  --cert-file <path>     File source cert (default: data/fleet-pre-certificates/<sha>.json)

Exit: 0 = PASS, 1 = BLOCK (fail-closed; never a lenient path).`);
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.log(`FLEET_PRE_CERT_BLOCK reason=bad_args:${String(error.message).replace(/\s+/g, '_')}`);
    return 1;
  }
  if (args.help) {
    usage();
    return 0;
  }

  const headSha = normalizeSha(args.sha);
  const pr = Number(args.pr);
  if (!HEX40.test(headSha || '')) return block('missing_or_invalid_sha', { head: headSha, pr });
  if (!Number.isInteger(pr) || pr <= 0) return block('missing_or_invalid_pr', { head: headSha, pr });
  if (!['issues', 'file'].includes(args.source)) return block('invalid_source', { head: headSha, pr, source: args.source });
  if (!Number.isFinite(args.maxAgeHours) || args.maxAgeHours <= 0) return block('invalid_max_age', { head: headSha, pr });

  const maxAgeMs = args.maxAgeHours * 60 * 60 * 1000;
  const token = args.token || process.env.GITHUB_TOKEN || '';

  if (args.source === 'file') {
    const defaultFile = path.resolve(__dirname, '..', 'data', 'fleet-pre-certificates', `${headSha}.json`);
    const certFile = args.certFile ? path.resolve(args.certFile) : defaultFile;
    let raw;
    try {
      raw = fs.readFileSync(certFile, 'utf8');
    } catch {
      return block('no_cert_file', { head: headSha, pr, source: 'file' });
    }
    let cert;
    try {
      cert = JSON.parse(raw);
    } catch {
      return block('unparseable_cert_file', { head: headSha, pr, source: 'file' });
    }
    const result = validateCert(cert, { headSha, pr, maxAgeMs, requireCanonical: true });
    if (!result.ok) return block(result.reasons.join(','), { head: headSha, pr, source: 'file' });
    const ageHours = (Date.now() - new Date(cert.verifiedAt).getTime()) / 3600000;
    return pass(cert, 'file', ageHours);
  }

  const { error, comments } = await fetchComments({ ...args, token });
  if (error) return block(error, { head: headSha, pr, source: 'issues' });
  if (comments.length === 0) return block('no_cert_comments', { head: headSha, pr, source: 'issues' });

  const parsed = certsFromComments(comments);
  if (parsed.length === 0) return block('no_parseable_cert_comments', { head: headSha, pr, source: 'issues' });

  const cert = selectCert(parsed, { pr, headSha });
  if (!cert) return block('no_matching_cert', { head: headSha, pr, source: 'issues' });

  const result = validateCert(cert, { headSha, pr, maxAgeMs });
  if (!result.ok) return block(result.reasons.join(','), { head: headSha, pr, source: 'issues' });

  const ageHours = (Date.now() - new Date(cert.verifiedAt).getTime()) / 3600000;
  return pass(cert, 'issues', ageHours);
}

if (require.main === module) {
  main().then((code) => process.exitCode = code);
}

module.exports = {
  CERTIFICATE_NAME,
  ACCEPTED_VERDICT,
  DEFAULT_MAX_AGE_HOURS,
  DEFAULT_ISSUE,
  normalizeSha,
  sha256Hex,
  canonicalJson,
  formatIssuedCert,
  parseCommentCert,
  certsFromComments,
  selectCert,
  validateCert,
  parseArgs,
  block,
  pass
};