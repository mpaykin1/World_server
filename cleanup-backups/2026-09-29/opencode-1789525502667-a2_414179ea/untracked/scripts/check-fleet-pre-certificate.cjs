'use strict';

/**
 * Fleet PRE exact-SHA certificate gate (GAP B permanent regression guard).
 *
 * Fails closed: integration of a PR head into master is authorized ONLY when a
 * fresh, exact-SHA Fleet PRE certificate with verdict READY_FOR_OCEAN exists
 * for that exact head SHA. Every missing / skipped / stale / mismatch /
 * unavailable case is a BLOCK (exit 1). There is no `|| true`, no skip path,
 * no fallback green, no cross-source fallback.
 *
 * Usable both as a CLI and as a require()-able module for offline tests.
 * No runtime dependencies.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const { URL } = require('url');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const REPO_SLUG = 'mpaykin1/World_server';
const ISSUE_NUMBER = 80;
const CERT_DIR = 'data/fleet-pre-certificates';
const CERT_KIND = 'FLEET_PRE';
const PASS_VERDICT = 'READY_FOR_OCEAN';
const SOURCES = ['repo', 'issue80'];

function isHex40(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/.test(value);
}

function timestampOf(value) {
  if (value == null) return NaN;
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) ? parsed : NaN;
}

function blockResult(code, reason) {
  return { pass: false, code, reason };
}

function passResult(reason) {
  return { pass: true, code: 'ready', reason };
}

/**
 * Pure fail-closed evaluation, no I/O.
 * options: { cert, expectedHeadSha, maxAgeMs, now, source, sourceAvailable }
 * Returns { pass, code, reason }.
 */
function evaluateCertificate(options = {}) {
  const { cert, expectedHeadSha } = options;
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DEFAULT_MAX_AGE_MS;
  const now = Number.isFinite(options.now) ? options.now : Date.now();
  const source = options.source || 'repo';
  const sourceAvailable = options.sourceAvailable !== false;

  if (!sourceAvailable) {
    return blockResult('source_unavailable', `Fleet PRE certificate source "${source}" is unavailable or ambiguous`);
  }
  if (cert == null) {
    return blockResult('no_cert', `no Fleet PRE certificate found for ${expectedHeadSha}`);
  }
  if (cert.skipped === true || cert.skipped === 'true' || String(cert.status || '').toLowerCase() === 'skipped') {
    return blockResult('skipped', 'a skipped certificate cannot authorize integration');
  }
  if (typeof cert !== 'object' || Array.isArray(cert) || Object.keys(cert).length === 0) {
    return blockResult('empty', 'Fleet PRE certificate is empty or malformed');
  }
  if (cert.certificate !== CERT_KIND) {
    return blockResult('wrong_kind', `certificate kind must be "${CERT_KIND}"`);
  }
  if (!isHex40(cert.exactHeadSha)) {
    return blockResult('sha_invalid', 'exactHeadSha must be a 40-hex Git SHA');
  }
  if (cert.exactHeadSha !== expectedHeadSha) {
    return blockResult('sha_mismatch', `certificate exactHeadSha ${cert.exactHeadSha} does not match head ${expectedHeadSha}`);
  }
  if (cert.verdict !== PASS_VERDICT) {
    return blockResult('verdict_not_ready', `certificate verdict must be "${PASS_VERDICT}" (got ${JSON.stringify(cert.verdict)})`);
  }
  if (!Number.isInteger(cert.pr) || cert.pr <= 0) {
    return blockResult('pr_invalid', 'certificate must reference a positive PR number');
  }
  const verifiedAt = timestampOf(cert.verifiedAt);
  if (!Number.isFinite(verifiedAt)) {
    return blockResult('verified_at_invalid', 'certificate verifiedAt must be a valid timestamp');
  }
  if (now - verifiedAt > maxAgeMs) {
    const hours = Math.max(1, Math.round((now - verifiedAt) / 3600000));
    return blockResult('stale', `Fleet PRE certificate is stale (${hours}h old, max ${Math.round(maxAgeMs / 3600000)}h)`);
  }
  if (cert.canonical != null) {
    if (typeof cert.canonical !== 'object' || cert.canonical === null || Array.isArray(cert.canonical)) {
      return blockResult('canonical_invalid', 'canonical must be an object');
    }
    if (cert.canonical.pr != null && (!Number.isInteger(cert.canonical.pr) || cert.canonical.pr <= 0)) {
      return blockResult('canonical_pr_invalid', 'canonical.pr must be a positive integer');
    }
    if (cert.canonical.sha256 != null && !/^[0-9a-f]{64}$/.test(String(cert.canonical.sha256))) {
      return blockResult('canonical_sha256_invalid', 'canonical.sha256 must be a 64-hex digest');
    }
  }
  return passResult(`exact fresh ${CERT_KIND} certificate authorizes integration of ${expectedHeadSha}`);
}

/**
 * Read a checked-in certificate from the deterministic repo source.
 * Returns { cert, sourceAvailable, parseError }.
 */
function readCertFromRepo(certDir, headSha) {
  const resolvedDir = path.resolve(certDir || CERT_DIR);
  if (!fs.existsSync(resolvedDir)) {
    return { cert: null, sourceAvailable: false, parseError: false };
  }
  const file = path.join(resolvedDir, `${headSha}.json`);
  if (!fs.existsSync(file)) {
    return { cert: null, sourceAvailable: true, parseError: false };
  }
  let cert = null;
  let parseError = false;
  try {
    cert = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    cert = null;
    parseError = true;
  }
  return { cert, sourceAvailable: true, parseError };
}

/**
 * Unauthenticated issue #80 scan for the canonical Fleet PRE comment line:
 *   [FLEET][PRE_INTEGRATION_QA][PR_*][EXACT_HEAD_<sha>]...READY_FOR_OCEAN=YES ... VERIFIED_AT=<ISO>
 * Returns a derived certificate object or null. A matching line that says
 * READY_FOR_OCEAN=NO is returned with a blocking verdict. A line without
 * VERIFIED_AT is returned with verifiedAt:null so the pure evaluator blocks
 * for missing/invalid timestamp (no time can be fabricated here).
 */
function scanIssueCommentsForCert(commentTexts, expectedHeadSha, now) {
  const texts = Array.isArray(commentTexts) ? commentTexts : [commentTexts];
  let found = null;
  for (const commentText of texts) {
    const lines = String(commentText || '').split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.includes('[FLEET][PRE_INTEGRATION_QA]')) continue;
      const headMatch = line.match(/\[EXACT_HEAD_([0-9a-f]{40})\]/);
      if (!headMatch || headMatch[1] !== expectedHeadSha) continue;
      const prMatch = line.match(/\[PR_#?(\d+)\]/);
      const readyYes = /READY_FOR_OCEAN\s*=\s*(YES|TRUE|1)\b/i.test(line);
      const readyNo = /READY_FOR_OCEAN\s*=\s*(NO|FALSE|0)\b/i.test(line);
      const contradictory = readyYes && readyNo;
      const verdict = contradictory ? 'AMBIGUOUS' : (readyYes ? PASS_VERDICT : 'NOT_READY');
      const dateMatch = line.match(/VERIFIED_AT=([A-Za-z0-9:+.TZ\-]+)/);
      const verifiedAt = dateMatch ? timestampOf(dateMatch[1]) : NaN;
      found = {
        certificate: CERT_KIND,
        pr: prMatch ? Number(prMatch[1]) : null,
        exactHeadSha: headMatch[1],
        verdict,
        verifiedAt: Number.isFinite(verifiedAt) ? verifiedAt : null,
        canonical: { source: 'issue80', pr: prMatch ? Number(prMatch[1]) : null }
      };
    }
  }
  return found;
}

/**
 * Fetch issue #80 comments (unauthenticated public API). Used only when the
 * caller explicitly opts into the issue80 source. Returns array of bodies.
 */
function fetchIssueComments(repoSlug, issueNumber, perPage = 100) {
  const url = new URL(`https://api.github.com/repos/${repoSlug}/issues/${issueNumber}/comments`);
  url.searchParams.set('per_page', String(perPage));
  url.searchParams.set('sort', 'created');
  url.searchParams.set('direction', 'desc');
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { headers: { 'User-Agent': 'world-server-fleet-pre-gate', Accept: 'application/vnd.github+json' }, timeout: 15000 },
      (res) => {
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return reject(new Error(`GitHub API returned HTTP ${res.statusCode}`));
        }
        const chunks = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString('utf8');
            const json = JSON.parse(body);
            if (!Array.isArray(json)) return reject(new Error('GitHub API response is not an array'));
            resolve(json.map((comment) => String(comment.body || '')));
          } catch (error) {
            reject(error);
          }
        });
      }
    );
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('GitHub API timed out')));
  });
}

/**
 * Orchestrator: dispatch to the one deterministic source (default repo) and
 * evaluate. No cross-source fallback -- the alternate source always fails
 * closed.
 */
async function runCertificateCheck({ headSha, source = 'repo', maxAgeMs, now, certDir = CERT_DIR, commentTexts }) {
  const resolvedSource = String(source || 'repo').toLowerCase();
  if (!isHex40(headSha)) {
    return blockResult('sha_invalid_input', 'headSha must be a 40-hex Git SHA');
  }
  if (!SOURCES.includes(resolvedSource)) {
    return blockResult('source_unavailable', `unknown Fleet PRE certificate source "${resolvedSource}" (ambiguous)`);
  }

  let cert = null;
  let sourceAvailable = true;
  if (resolvedSource === 'repo') {
    const loaded = readCertFromRepo(certDir, headSha);
    cert = loaded.cert;
    sourceAvailable = loaded.sourceAvailable;
    if (loaded.parseError) {
      return blockResult('cert_parse_error', `certificate file for ${headSha} is not valid JSON`);
    }
  } else {
    let texts = commentTexts;
    if (!Array.isArray(texts)) {
      try {
        texts = await fetchIssueComments(REPO_SLUG, ISSUE_NUMBER);
        if (texts.length === 0) {
          return blockResult('source_unavailable', 'issue #80 scan returned zero comments (source unavailable)');
        }
      } catch (error) {
        return blockResult('source_unavailable', `issue #80 scan failed: ${error.message}`);
      }
    }
    if (!Array.isArray(texts) || texts.length === 0) {
      return blockResult('source_unavailable', 'issue #80 comment source is unavailable/empty');
    }
    cert = scanIssueCommentsForCert(texts, headSha, now);
    sourceAvailable = true;
  }

  return evaluateCertificate({
    cert,
    expectedHeadSha: headSha,
    maxAgeMs,
    now,
    source: resolvedSource,
    sourceAvailable
  });
}

function parseArgs(argv) {
  const args = argv.slice();
  const headSha = args.find((value) => isHex40(value)) || null;
  const sourceArg = args.find((value) => value.startsWith('--source='));
  const maxAgeArg = args.find((value) => value.startsWith('--max-age-hours='));
  const envSource = String(process.env.FLEET_PRE_CERT_SOURCE || '').toLowerCase();
  const source = sourceArg ? sourceArg.split('=')[1].toLowerCase() : (envSource || 'repo');
  const maxAgeHours = Number(
    (maxAgeArg ? maxAgeArg.split('=')[1] : process.env.FLEET_PRE_MAX_AGE_HOURS) || 24
  );
  return { headSha, source, maxAgeMs: Number.isFinite(maxAgeHours) ? maxAgeHours * 3600000 : DEFAULT_MAX_AGE_MS };
}

async function main() {
  const { headSha, source, maxAgeMs } = parseArgs(process.argv.slice(2));
  if (!headSha) {
    console.error(
      'FLEET PRE BLOCK: [usage] node scripts/check-fleet-pre-certificate.cjs <headSha> [--source=repo|issue80] [--max-age-hours=N]'
    );
    process.exit(1);
  }
  const result = await runCertificateCheck({ headSha, source, maxAgeMs });
  if (result.pass) {
    console.log(`FLEET PRE PASS: ${result.reason}`);
    process.exit(0);
  }
  console.error(`FLEET PRE BLOCK: [${result.code}] ${result.reason}`);
  process.exit(1);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`FLEET PRE BLOCK: [internal] ${error && error.stack ? error.stack : error}`);
    process.exit(1);
  });
}

module.exports = {
  DEFAULT_MAX_AGE_MS,
  REPO_SLUG,
  ISSUE_NUMBER,
  CERT_DIR,
  CERT_KIND,
  PASS_VERDICT,
  SOURCES,
  isHex40,
  timestampOf,
  evaluateCertificate,
  readCertFromRepo,
  scanIssueCommentsForCert,
  fetchIssueComments,
  runCertificateCheck,
  parseArgs
};