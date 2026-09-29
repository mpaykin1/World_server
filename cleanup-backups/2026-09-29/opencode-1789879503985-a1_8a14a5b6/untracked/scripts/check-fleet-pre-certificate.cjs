#!/usr/bin/env node
'use strict';

/**
 * Fleet PRE exact-SHA merge-chain certificate gate.
 *
 * Fail-closed validator for the Fleet PRE_INTEGRATION_QA stage. A PR that
 * targets master may only proceed toward Ocean integration when an
 * independent machine-readable certificate exists for the EXACT PR head
 * SHA, issued no longer than `--max-age-h` ago, with verdict
 * READY_FOR_OCEAN=YES. Every other state (absent, skipped, empty,
 * mismatched SHA/PR, non-ready verdict, stale, unavailable or ambiguous
 * source) is BLOCK. There is no default-green path.
 *
 * Exit codes (used by .github/workflows/fleet-pre-merge-chain.yml):
 *   0 = PASS  (exact fresh READY_FOR_OCEAN=YES certificate found)
 *   1 = BLOCK (any other state)
 *
 * Primary certificate source: canonical pipeline ledger (issue #80)
 * comment scan for the deterministic marker
 *     [FLEET][PRE_INTEGRATION_QA][PR_<n>][EXACT_HEAD_<full 40-char sha>]
 * fetched through `gh api`; comment `created_at` is the issuance time.
 *
 * Secondary source: checked-in JSON certificates under
 *     data/fleet-pre-certificates/<full-40-char-sha>.json
 * with fields { headSha, pr, verdict, issuedAt }.
 *   - Primary unavailable AND no valid secondary certificate => BLOCK.
 *   - Primary available but BLOCKing => BLOCK (secondary never overrides
 *     an available authoritative primary).
 *
 * Pure Node: standard-library only, `module.exports` with the validation
 * logic separated from the gh/fs I/O in `main()`.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const DEFAULT_ISSUE_NUMBER = 80;
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const CLOCK_SKEW_TOLERANCE_MS = 5 * 60 * 1000;
const MAX_ISSUE_COMMENTS = 100;

const READY_VERDICT = 'READY_FOR_OCEAN';
const CERTS_DIR_NAME = 'fleet-pre-certificates';

const CERT_MARKER_PATTERN = /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-fA-F]{40})\]/g;
const READY_TOKEN_PATTERN = /\bREADY_FOR_OCEAN\s*=\s*YES\b/i;
const NEGATIVE_TOKEN_PATTERN = /\bREADY_FOR_OCEAN\s*=\s*NO\b/i;

const BLOCK_RULES = Object.freeze({
  HEAD_REQUIRED: 'HEAD_REQUIRED',
  SOURCE_UNAVAILABLE: 'SOURCE_UNAVAILABLE',
  NO_EXACT_CERT: 'NO_EXACT_CERT',
  NO_EXPLICIT_VERDICT: 'NO_EXPLICIT_VERDICT',
  VERDICT_NOT_READY: 'VERDICT_NOT_READY',
  PR_MISMATCH: 'PR_MISMATCH',
  MISSING_FRESHNESS: 'MISSING_FRESHNESS',
  STALE_CERT: 'STALE_CERT',
  AMBIGUOUS_SOURCE: 'AMBIGUOUS_SOURCE',
});

function normalizeSha(value) {
  return String(value || '').trim().toLowerCase();
}

function block(rule, reasons) {
  return { verdict: 'BLOCK', rule, reasons: Array.isArray(reasons) ? reasons : [reasons] };
}

function pass(reasons) {
  return {
    verdict: 'PASS',
    rule: READY_VERDICT,
    reasons: Array.isArray(reasons) ? reasons : [],
  };
}

/**
 * Parses an explicit textual verdict from a free-form comment/file body.
 * Returns READY_VERDICT, 'RETURN_TO_BUILDER' or 'NO_EXPLICIT_VERDICT'.
 */
function parseVerdict(body) {
  const text = String(body || '');
  if (READY_TOKEN_PATTERN.test(text)) return READY_VERDICT;
  if (NEGATIVE_TOKEN_PATTERN.test(text)) return 'RETURN_TO_BUILDER';
  if (/\bRETURN_TO_BUILDER\b/i.test(text)) return 'RETURN_TO_BUILDER';
  return 'NO_EXPLICIT_VERDICT';
}

/**
 * Pure extraction. Accepts an array of comment objects
 * ({ body, created_at }) or plain strings. Returns normalized cert
 * records sorted newest-first by issuance timestamp (deterministic
 * tie-break: source then pr for reproducible ambiguity resolution).
 */
function extractCertificates(comments) {
  const result = [];
  for (const raw of (comments || [])) {
    const body = typeof raw === 'string' ? raw : String(raw.body || '');
    const createdAt = typeof raw === 'string' ? '' : String(raw.created_at || raw.createdAt || '');
    CERT_MARKER_PATTERN.lastIndex = 0;
    const markers = [];
    let match;
    while ((match = CERT_MARKER_PATTERN.exec(body)) !== null) markers.push(match);
    CERT_MARKER_PATTERN.lastIndex = 0;
    if (!markers.length) continue;
    const verdict = parseVerdict(body);
    for (const m of markers) {
      result.push({
        pr: m[1],
        headSha: normalizeSha(m[2]),
        verdict,
        verdictAt: createdAt || null,
        source: 'issue-comment',
      });
    }
  }
  result.sort((a, b) => {
    const byTime = String(b.verdictAt || '').localeCompare(String(a.verdictAt || ''));
    if (byTime !== 0) return byTime;
    return String(a.source).localeCompare(String(b.source)) || String(a.pr).localeCompare(String(b.pr));
  });
  return result;
}

/**
 * Pure fail-closed certificate validation (the seven gate rules).
 * `nowMs`/`maxAgeMs` are explicit for deterministic testing.
 */
function validateCertificates({ certificates, expectedHeadSha, expectedPr, nowMs, maxAgeMs }) {
  const head = normalizeSha(expectedHeadSha);
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const maxAge = Number.isFinite(maxAgeMs) && maxAgeMs > 0 ? maxAgeMs : DEFAULT_MAX_AGE_MS;

  // R1/R3: a certificate is mandatory for this exact head.
  if (!head) return block(BLOCK_RULES.HEAD_REQUIRED, 'expected head SHA is required and cannot be empty');

  const allCerts = (certificates || []).filter((c) => c && c.headSha);
  const certs = allCerts.filter((c) => c.headSha === head);
  if (!certs.length) {
    const others = allCerts.filter((c) => c.headSha !== head).length;
    return block(
      BLOCK_RULES.NO_EXACT_CERT,
      `no Fleet PRE certificate matches exact head ${head}` +
        (others ? ` (${others} certificate(s) exist only for other SHAs)` : '')
    );
  }

  // Optional PR-scope: the marker carries [PR_<n>]; when the expected PR is
  // known, only certificates for that PR at this exact head qualify.
  const requirePr = expectedPr != null && String(expectedPr) !== '';
  const narrowed = requirePr
    ? certs.filter((c) => String(c.pr) === String(expectedPr))
    : certs;
  if (requirePr && !narrowed.length) {
    return block(
      BLOCK_RULES.PR_MISMATCH,
      `no Fleet PRE certificate for PR ${expectedPr} at exact head ${head}`
    );
  }

  // R6: two newest certificates sharing a timestamp with conflicting
  // verdicts make the source ambiguous (never pick one silently).
  const [latest, second] = narrowed;
  if (
    second &&
    String(second.verdictAt || '') === String(latest.verdictAt || '') &&
    latest.verdict !== second.verdict
  ) {
    return block(
      BLOCK_RULES.AMBIGUOUS_SOURCE,
      `conflicting certificates share the same issuance timestamp for head ${head}`
    );
  }

  // Freshness must be provable (R5/R6).
  if (!latest.verdictAt) {
    return block(
      BLOCK_RULES.MISSING_FRESHNESS,
      `certificate for head ${head} has no issuance timestamp; freshness cannot be proven`
    );
  }
  const issuedMs = Date.parse(latest.verdictAt);
  if (!Number.isFinite(issuedMs)) {
    return block(
      BLOCK_RULES.MISSING_FRESHNESS,
      `unparseable issuance timestamp '${latest.verdictAt}' for head ${head}`
    );
  }
  if (issuedMs > now + CLOCK_SKEW_TOLERANCE_MS) {
    return block(
      BLOCK_RULES.AMBIGUOUS_SOURCE,
      `certificate issuance timestamp is in the future: ${latest.verdictAt}`
    );
  }
  if (now - issuedMs > maxAge) {
    return block(
      BLOCK_RULES.STALE_CERT,
      `certificate is stale: issued ${latest.verdictAt}; max age ${Math.round(maxAge / 3600000)}h`
    );
  }

  // R2/R4: an exact fresh cert is only PASS with an explicit ready verdict.
  if (latest.verdict === 'NO_EXPLICIT_VERDICT') {
    return block(
      BLOCK_RULES.NO_EXPLICIT_VERDICT,
      `certificate for head ${head} is skipped/empty: no explicit READY_FOR_OCEAN=YES verdict`
    );
  }
  if (latest.verdict !== READY_VERDICT) {
    return block(
      BLOCK_RULES.VERDICT_NOT_READY,
      `certificate verdict ${latest.verdict} is not READY_FOR_OCEAN for head ${head}`
    );
  }

  // R7: exact fresh ready certificate.
  return pass([
    `exact fresh READY_FOR_OCEAN certificate found for head ${head}`,
    `PR ${latest.pr}, issued ${latest.verdictAt}, source ${latest.source}`,
  ]);
}

/**
 * Pure source-availability decision (R6). The primary issue-comment source
 * is authoritative when available; the checked-in directory is only the
 * fallback used when the primary cannot be reached at all.
 */
function decide({ primaryAvailable, primary, local }) {
  if (primaryAvailable) {
    if (primary && primary.verdict === 'PASS') return primary;
    if (!primary) {
      return block(BLOCK_RULES.SOURCE_UNAVAILABLE, 'primary source produced no validation result');
    }
    return primary;
  }
  if (local && local.verdict === 'PASS') return local;
  return block(
    BLOCK_RULES.SOURCE_UNAVAILABLE,
    'authoritative issue-comment source is unavailable and no valid checked-in certificate exists'
  );
}

/**
 * Pure secondary-source loader mapping. Kept separate from fs I/O for
 * determinism; `readLocalCertificates` wraps it.
 */
function mapLocalCertificate(obj, fileName) {
  if (!obj || !obj.headSha) return null;
  const verdict = String(obj.verdict || '').toUpperCase();
  return {
    pr: obj.pr != null ? String(obj.pr) : null,
    headSha: normalizeSha(obj.headSha),
    verdict: verdict === 'READY_FOR_OCEAN'
      ? READY_VERDICT
      : (verdict ? 'RETURN_TO_BUILDER' : 'NO_EXPLICIT_VERDICT'),
    verdictAt: String(obj.issuedAt || '') || null,
    source: 'local-file',
    file: fileName,
  };
}

function readLocalCertificates(certDir) {
  const dir = path.resolve(String(certDir || ''));
  const available = fs.existsSync(dir);
  const certs = [];
  if (available) {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.json$/i.test(name)) continue;
      let obj = null;
      try {
        obj = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      } catch {
        continue;
      }
      const cert = mapLocalCertificate(obj, name);
      if (cert) certs.push(cert);
    }
  }
  return { available, certs };
}

function fetchIssueComments({ repo, issueNumber, ghBin, token }) {
  if (!repo) return { available: false, error: 'repository owner/name is unavailable' };
  const gh = ghBin || 'gh';
  const env = { ...process.env };
  if (token) env.GH_TOKEN = token;
  const args = [
    'api',
    `repos/${repo}/issues/${issueNumber}/comments?per_page=${MAX_ISSUE_COMMENTS}`,
    '--paginate',
  ];
  try {
    const stdout = execFileSync(gh, args, {
      encoding: 'utf8',
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
    });
    let parsed;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      return { available: false, error: 'gh api returned non-JSON output' };
    }
    if (!Array.isArray(parsed)) {
      return { available: false, error: 'gh api returned an unexpected payload shape' };
    }
    return {
      available: true,
      comments: parsed.map((c) => ({ body: c.body, created_at: c.created_at })),
    };
  } catch (error) {
    const detail = String((error && error.stderr) || error || '').trim();
    return { available: false, error: detail.slice(0, 500) || 'gh api invocation failed' };
  }
}

function printUsage() {
  console.log(`Usage:
  node scripts/check-fleet-pre-certificate.cjs --head <full-40-char-sha> [options]

Required:
  --head <sha>            exact PR head SHA that must carry the certificate
  --repo <owner/name>     repository (default: \$GITHUB_REPOSITORY)

Options:
  --pr <number>           require the certificate to also carry [PR_<number>]
  --issue <number>        canonical ledger issue number (default: ${DEFAULT_ISSUE_NUMBER})
  --gh <binary>           gh CLI path (default: 'gh')
  --cert-dir <dir>        secondary certificate directory
                          (default: data/fleet-pre-certificates)
  --max-age-h <hours>     certificate freshness limit (default: 24)

Exit: 0 = PASS, 1 = BLOCK`);
}

function run(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--head') args.head = argv[++i];
    else if (key === '--pr') args.pr = argv[++i];
    else if (key === '--repo') args.repo = argv[++i];
    else if (key === '--issue') args.issue = argv[++i];
    else if (key === '--gh') args.gh = argv[++i];
    else if (key === '--cert-dir') args.certDir = argv[++i];
    else if (key === '--max-age-h') args.maxAgeH = argv[++i];
    else if (key === '--help' || key === '-h') { printUsage(); return 0; }
  }

  if (args.help) return 0;

  const head = args.head || process.env.FLEET_PRE_EXPECTED_HEAD_SHA || '';
  const repo = args.repo || process.env.FLEET_PRE_REPO || process.env.GITHUB_REPOSITORY || '';
  const issueNumber = args.issue || process.env.FLEET_PRE_ISSUE_NUMBER || String(DEFAULT_ISSUE_NUMBER);
  const expectedPr = args.pr != null ? String(args.pr) : '';
  const certDir = args.certDir ||
    path.join(process.cwd(), 'data', CERTS_DIR_NAME);
  const maxAgeMs = args.maxAgeH ? Number(args.maxAgeH) * 3600000 : DEFAULT_MAX_AGE_MS;
  const nowMs = Date.now();

  const missingHead = validateCertificates({
    certificates: [],
    expectedHeadSha: head,
    expectedPr,
    nowMs,
    maxAgeMs,
  });
  if (missingHead.rule === BLOCK_RULES.HEAD_REQUIRED) {
    printResult(missingHead);
    return 1;
  }

  let primary;
  if (process.env.FLEET_PRE_PRIMARY_JSON) {
    // Injectable for reproducible CI/debug runs without network.
    let comments = [];
    try {
      comments = JSON.parse(process.env.FLEET_PRE_PRIMARY_JSON);
      if (!Array.isArray(comments)) comments = [];
    } catch {
      primary = { available: false, error: 'FLEET_PRE_PRIMARY_JSON is not a JSON array' };
    }
    if (!primary) primary = { available: true, comments };
  } else {
    primary = fetchIssueComments({ repo, issueNumber, ghBin: args.gh, token: process.env.GH_TOKEN });
  }

  const local = readLocalCertificates(certDir);

  let result;
  if (primary.available) {
    const certs = extractCertificates(primary.comments || []);
    const validated = validateCertificates({
      certificates: certs,
      expectedHeadSha: head,
      expectedPr,
      nowMs,
      maxAgeMs,
    });
    result = decide({ primaryAvailable: true, primary: validated, local: null });
  } else {
    const localValidated = local.available
      ? validateCertificates({
          certificates: local.certs,
          expectedHeadSha: head,
          expectedPr,
          nowMs,
          maxAgeMs,
        })
      : null;
    result = decide({ primaryAvailable: false, primary: null, local: localValidated });
  }

  printResult(result);
  if (primary.available === false) {
    console.error(`[FLEET_PRE] primary source unavailable: ${primary.error || 'unknown'}`);
  }
  return result.verdict === 'PASS' ? 0 : 1;
}

function printResult(result) {
  const label = result.verdict === 'PASS' ? 'PASS' : 'BLOCK';
  console.log(`[FLEET_PRE] ${label} rule=${result.rule}`);
  for (const reason of result.reasons || []) console.log(`  - ${reason}`);
}

if (require.main === module) {
  process.exit(run(process.argv.slice(2)));
}

module.exports = {
  DEFAULT_ISSUE_NUMBER,
  DEFAULT_MAX_AGE_MS,
  READY_VERDICT,
  CERT_MARKER_PATTERN,
  BLOCK_RULES,
  normalizeSha,
  extractCertificates,
  parseVerdict,
  validateCertificates,
  decide,
  mapLocalCertificate,
  readLocalCertificates,
  fetchIssueComments,
  run,
};