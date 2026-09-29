'use strict';

/**
 * Fail-closed exact-SHA Fleet PRE certificate gate.
 *
 * Integration (Ocean merge) toward master is only allowed when a single,
 * unambiguous, fresh READY_FOR_OCEAN certificate exists for the EXACT PR
 * HEAD_SHA. Anything missing, skipped, empty, malformed, mismatched, stale,
 * future-dated or tampered must BLOCK. There is no skip, no `|| true`, no
 * Netlify-style fallback and no self-certification path.
 *
 * Authoritative certificate source (one deterministic repo-truth location):
 *   data/fleet-pre-certificates/<exactHeadSha>.json
 * Alternative sources (e.g. unauthenticated issue #80 comment scans) are NOT
 * used here; they fail closed by absence, so the checked-in file is the only
 * source and both-unavailable can never be reported green.
 *
 * Certificate schema (canonical fields):
 *   certificate    string  MUST be "FLEET_PRE"
 *   pr             number  PR number (positive integer)
 *   exactHeadSha   string  40-char lowercase hex == PR HEAD_SHA
 *   verdict        string  MUST be "READY_FOR_OCEAN"
 *   verifiedAt     string  ISO-8601, within [now - maxAgeMs, now + skew]
 *   canonicalSha256 string self-hash: sha256 of the canonical JSON (sorted
 *                          keys) of the other five fields above
 *
 * CLI:
 *   node scripts/check-fleet-pre-certificate.cjs <head-sha> [certs-dir] [max-age-ms]
 *   node scripts/check-fleet-pre-certificate.cjs --issue <head-sha> --pr <n> [certs-dir]
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const CERTIFICATE_ID = 'FLEET_PRE';
const READY_VERDICT = 'READY_FOR_OCEAN';
const HEAD_SHA_RE = /^[0-9a-f]{40}$/;
const SHA256_RE = /^[0-9a-f]{64}$/;
const DEFAULT_CERTS_DIR = path.resolve(__dirname, '..', 'data', 'fleet-pre-certificates');

function block(code, reason) {
  return { ok: false, code, reason, passed: false };
}

function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, sortKeys(value[key])])
    );
  }
  return value;
}

function canonicalSha256Of(cert) {
  const { canonicalSha256, ...fields } = cert || {};
  const canonical = JSON.stringify(sortKeys(fields));
  return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/**
 * Pure validation logic, no I/O. Returns { ok, code, reason, passed }.
 * Every non-conforming input resolves to ok:false (fail closed).
 */
function evaluateCertificate(cert, options = {}) {
  const { headSha, maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now() } = options;

  if (!cert || typeof cert !== 'object' || Array.isArray(cert) || Object.keys(cert).length === 0) {
    return block('EMPTY_CERT', 'Certificate is empty/skipped. Missing or empty certificate must block.');
  }
  if (typeof headSha !== 'string' || !HEAD_SHA_RE.test(headSha)) {
    return block('BAD_FIELD', 'headSha argument is missing or not a 40-char lowercase hex SHA.');
  }
  const { certificate, pr, exactHeadSha, verdict, verifiedAt, canonicalSha256 } = cert;
  if (certificate !== CERTIFICATE_ID) {
    return block('NOT_FLEET_PRE', `certificate must equal "${CERTIFICATE_ID}", got ${JSON.stringify(certificate)}.`);
  }
  if (typeof pr !== 'number' && typeof pr !== 'string') {
    return block('BAD_FIELD', 'pr is missing or not a number.');
  }
  const prNumber = Number(pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    return block('BAD_FIELD', 'pr is not a positive integer.');
  }
  if (typeof exactHeadSha !== 'string' || !HEAD_SHA_RE.test(exactHeadSha)) {
    return block('BAD_FIELD', 'exactHeadSha is missing or not a 40-char lowercase hex SHA.');
  }
  if (exactHeadSha !== headSha.toLowerCase()) {
    return block('SHA_MISMATCH', `certificate exactHeadSha ${exactHeadSha} != requested head SHA ${headSha}. Different-SHA certificate must block.`);
  }
  if (verdict !== READY_VERDICT) {
    return block('VERDICT_MISMATCH', `verdict must equal "${READY_VERDICT}", got ${JSON.stringify(verdict)}. Skipped/non-ready verdict must block.`);
  }
  const verifiedMs = Date.parse(verifiedAt);
  if (!Number.isFinite(verifiedMs)) {
    return block('BAD_FIELD', `verifiedAt is not a valid ISO-8601 timestamp: ${JSON.stringify(verifiedAt)}.`);
  }
  const ageMs = now - verifiedMs;
  if (Number.isFinite(maxAgeMs) && ageMs > maxAgeMs) {
    return block('STALE_CERT', `certificate verifiedAt ${verifiedAt} is older than max-age ${maxAgeMs} ms. Stale certificate must block.`);
  }
  if (ageMs < -FUTURE_SKEW_MS) {
    return block('FUTURE_CERT', `certificate verifiedAt ${verifiedAt} is in the future beyond skew. Ambiguous timing must block.`);
  }
  if (typeof canonicalSha256 !== 'string' || !SHA256_RE.test(canonicalSha256)) {
    return block('BAD_FIELD', 'canonicalSha256 is missing or not a 64-char lowercase hex SHA256.');
  }
  const expected = canonicalSha256Of(cert);
  if (canonicalSha256 !== expected) {
    return block('HASH_MISMATCH', `canonicalSha256 ${canonicalSha256} != recomputed ${expected}. Tampered/ambiguous certificate must block.`);
  }
  return { ok: true, code: 'PASS', reason: 'Exact fresh READY_FOR_OCEAN certificate present for head SHA.', passed: true };
}

/**
 * I/O boundary. Loads exactly data/fleet-pre-certificates/<headSha>.json.
 * Injectable fs/path keep the boundary testable offline.
 */
function loadCertificate({ certsDir, headSha, fsImpl = fs, pathImpl = path }) {
  if (typeof headSha !== 'string' || !HEAD_SHA_RE.test(headSha)) {
    return { found: false, sourcePath: headSha ? String(headSha) : null, error: 'invalid-head-sha' };
  }
  const sourcePath = pathImpl.join(certsDir, `${headSha}.json`);
  let raw;
  try {
    raw = fsImpl.readFileSync(sourcePath, 'utf8');
  } catch (err) {
    return { found: false, sourcePath, error: err.code || 'read-error' };
  }
  let cert = null;
  let malformed = false;
  try {
    cert = JSON.parse(raw);
  } catch {
    malformed = true;
  }
  return { found: true, sourcePath, cert, malformed };
}

/**
 * Orchestrates source resolution + pure validation. Both unavailable/malformed
 * sources fail closed.
 */
function checkCertificate({ certsDir, headSha, maxAgeMs = DEFAULT_MAX_AGE_MS, now = Date.now(), fsImpl = fs, pathImpl = path }) {
  const source = loadCertificate({ certsDir, headSha, fsImpl, pathImpl });
  if (!source.found) {
    return { ok: false, code: 'NO_CERT', reason: `Certificate source unavailable for head SHA ${headSha} (${source.sourcePath}). Missing certificate must block.`, passed: false, source };
  }
  if (source.malformed) {
    return { ok: false, code: 'MALFORMED_CERT', reason: `Certificate source ${source.sourcePath} is malformed/ambiguous JSON. Must block.`, passed: false, source };
  }
  const verdict = evaluateCertificate(source.cert, { headSha, maxAgeMs, now });
  return { ...verdict, source };
}

function issueCertificate({ certsDir, headSha, pr, now = Date.now(), fsImpl = fs, pathImpl = path }) {
  if (typeof headSha !== 'string' || !HEAD_SHA_RE.test(headSha)) {
    throw new Error(`--issue requires a 40-char lowercase hex head SHA, got ${JSON.stringify(headSha)}.`);
  }
  const prNumber = Number(pr);
  if (!Number.isInteger(prNumber) || prNumber <= 0) {
    throw new Error(`--issue requires a positive integer PR number, got ${JSON.stringify(pr)}.`);
  }
  const cert = {
    certificate: CERTIFICATE_ID,
    pr: prNumber,
    exactHeadSha: headSha.toLowerCase(),
    verdict: READY_VERDICT,
    verifiedAt: new Date(now).toISOString()
  };
  cert.canonicalSha256 = canonicalSha256Of(cert);
  const sourcePath = pathImpl.join(certsDir, `${cert.exactHeadSha}.json`);
  if (fsImpl.existsSync(sourcePath)) {
    throw new Error(`Refusing to overwrite existing certificate ${sourcePath}.`);
  }
  fsImpl.mkdirSync(certsDir, { recursive: true });
  fsImpl.writeFileSync(sourcePath, JSON.stringify(cert, null, 2) + '\n', 'utf8');
  return { cert, sourcePath };
}

function parseArgs(args) {
  const issueMode = args[0] === '--issue';
  let headSha = null;
  let pr = null;
  const rest = [];
  for (let i = issueMode ? 1 : 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--pr') {
      pr = args[i + 1];
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    if (headSha === null) headSha = arg;
    else rest.push(arg);
  }
  const certsDir = rest.length > 0 ? rest[rest.length - 1] : DEFAULT_CERTS_DIR;
  const maxAgeMs = rest.length > 1 ? Number(rest[0]) : DEFAULT_MAX_AGE_MS;
  return { issueMode, headSha, pr, certsDir, maxAgeMs };
}

function main() {
  const args = process.argv.slice(2);
  const { issueMode, headSha, pr, certsDir, maxAgeMs } = parseArgs(args);
  if (issueMode) {
    const result = issueCertificate({ certsDir, headSha, pr });
    console.log(JSON.stringify({ ok: true, issued: true, sourcePath: result.sourcePath, cert: result.cert }, null, 2));
    return;
  }

  const normalizedHeadSha = (headSha || process.env.GITHUB_SHA || '').trim().toLowerCase();
  if (!HEAD_SHA_RE.test(normalizedHeadSha)) {
    process.stderr.write('[FLEET_PRE_CERT] FAIL usage: node scripts/check-fleet-pre-certificate.cjs <head-sha> [certs-dir] [max-age-ms]\n');
    process.exit(1);
  }
  const result = checkCertificate({ certsDir, headSha: normalizedHeadSha, maxAgeMs });
  const output = {
    ok: result.ok,
    code: result.code,
    reason: result.reason,
    headSha: normalizedHeadSha,
    source: result.source ? result.source.sourcePath : null,
    maxAgeMs,
    evaluatedAt: new Date().toISOString()
  };
  console.log(JSON.stringify(output, null, 2));
  if (!result.ok) {
    process.stderr.write(`[FLEET_PRE_CERT] BLOCK ${result.code}: ${result.reason}\n`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = {
  DEFAULT_MAX_AGE_MS,
  FUTURE_SKEW_MS,
  CERTIFICATE_ID,
  READY_VERDICT,
  canonicalSha256Of,
  evaluateCertificate,
  loadCertificate,
  checkCertificate,
  issueCertificate
};