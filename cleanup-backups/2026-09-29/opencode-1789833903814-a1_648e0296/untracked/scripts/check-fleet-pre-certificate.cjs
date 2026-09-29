#!/usr/bin/env node
'use strict';
// Fleet PRE merge-chain certificate gate.
//
// Fail-closed: no PR may be integrated into master without a fresh, exact-SHA
// READY_FOR_OCEAN certificate issued independently by the Fleet PRE stage.
// Every validation rule below returns BLOCK unless the certificate matches the
// exact PR head, is the required verdict, is fresh and is unambiguous.
//
// Authoritative certificate source (exactly one, deterministic):
//   data/fleet-pre-certificates/<sha>.json  (checked-in repo truth)
// A certificate recorded anywhere else (for example only in issue #80
// comments) does not count and is treated as absent, i.e. BLOCK.

const fs = require('node:fs');
const path = require('node:path');

const CERTIFICATE_KIND = 'FLEET_PRE';
const REQUIRED_VERDICT = 'READY_FOR_OCEAN';
const DEFAULT_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

const RULE = Object.freeze({
  NO_CERT: 'no-cert',
  SKIPPED_EMPTY: 'skipped-empty',
  SHA_MISMATCH: 'sha-mismatch',
  VERDICT_MISMATCH: 'verdict-mismatch',
  STALE: 'stale',
  AMBIGUOUS: 'ambiguous',
  MALFORMED: 'malformed',
  PASS: 'pass',
});

function isSha(value) {
  return typeof value === 'string' && /^[0-9a-f]{40}$/i.test(value);
}

// Keep only the machine-readable fields we validate; add sourceFile so the
// file-name-vs-content consistency of the <sha>.json source stays checkable.
function normalizeRawCert(raw, sourceFile) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  return {
    certificate: raw.certificate,
    pr: raw.pr,
    exactHeadSha: raw.exactHeadSha,
    verdict: raw.verdict,
    verifiedAt: raw.verifiedAt,
    canonicalSha256: raw.canonicalSha256,
    skipped: raw.skipped === true,
    valid: raw.valid === undefined ? true : raw.valid === true,
    sourceFile: typeof sourceFile === 'string' ? sourceFile : '',
  };
}

// Pure decision logic, fully separated from I/O so every fail-closed rule is
// unit-testable offline. `now` and `maxAgeMs` are injectable for tests.
function evaluateFleetPreCertificate({ headSha, certificates, now = Date.now(), maxAgeMs = DEFAULT_MAX_AGE_MS }) {
  if (!isSha(headSha)) {
    return { ok: false, rule: RULE.MALFORMED, detail: `headSha is not a 40-char hex SHA string: ${String(headSha)}` };
  }

  const certs = Array.isArray(certificates) ? certificates.map((c) => normalizeRawCert(c, c && c.sourceFile)).filter(Boolean) : [];

  // A certificate FILE named exactly <headSha>.json must agree with its contents.
  const fileClaims = certs.filter((c) => (c.sourceFile || '').replace(/\.json$/i, '') === headSha);
  if (fileClaims.length > 0 && fileClaims.some((c) => c.exactHeadSha !== headSha)) {
    return {
      ok: false,
      rule: RULE.SHA_MISMATCH,
      detail: `certificate file claims head ${headSha} but its exactHeadSha field (${String(fileClaims[0].exactHeadSha)}) differs`,
    };
  }

  // Candidate = certificate whose exactHeadSha field names the PR head exactly.
  const candidates = certs.filter((c) => c.exactHeadSha === headSha);
  if (candidates.length === 0) {
    return { ok: false, rule: RULE.NO_CERT, detail: `no FLEET_PRE certificate found for head ${headSha}` };
  }

  // One head must map to exactly one certificate outcome (no conflicting copies).
  const signatures = new Set(candidates.map((c) => `${c.pr}\u0001${c.verdict}\u0001${c.verifiedAt}`));
  if (signatures.size !== 1) {
    return {
      ok: false,
      rule: RULE.AMBIGUOUS,
      detail: `${candidates.length} conflicting certificates found for head ${headSha}`,
    };
  }

  const cert = candidates[0];

  // Empty/skipped/explicitly-invalid certificates fail closed.
  if (cert.certificate !== CERTIFICATE_KIND) {
    return { ok: false, rule: RULE.SKIPPED_EMPTY, detail: `certificate.certificate is not "${CERTIFICATE_KIND}"` };
  }
  if (cert.skipped || !cert.valid) {
    return { ok: false, rule: RULE.SKIPPED_EMPTY, detail: 'certificate is explicitly skipped or invalid' };
  }
  if (!isSha(cert.exactHeadSha)) {
    return { ok: false, rule: RULE.SKIPPED_EMPTY, detail: 'certificate.exactHeadSha is missing or malformed' };
  }
  if (cert.exactHeadSha !== headSha) {
    return { ok: false, rule: RULE.SHA_MISMATCH, detail: `certificate exactHeadSha ${cert.exactHeadSha} does not match head ${headSha}` };
  }
  if (typeof cert.pr !== 'string' || !cert.pr.trim()) {
    return { ok: false, rule: RULE.SKIPPED_EMPTY, detail: 'certificate.pr is missing' };
  }

  // Verdict: only the exact READY_FOR_OCEAN value authorizes integration.
  if (cert.verdict !== REQUIRED_VERDICT) {
    return {
      ok: false,
      rule: RULE.VERDICT_MISMATCH,
      detail: `certificate verdict ${String(cert.verdict)} is not "${REQUIRED_VERDICT}"`,
    };
  }

  // Freshness: verifiedAt must parse, must not be in the future, and must be
  // newer than maxAgeMs (default 24 hours).
  const verifiedAtMs = Date.parse(cert.verifiedAt);
  if (!Number.isFinite(verifiedAtMs)) {
    return { ok: false, rule: RULE.STALE, detail: 'certificate.verifiedAt is not a valid ISO timestamp' };
  }
  if (verifiedAtMs > now + 5 * 60 * 1000) {
    return { ok: false, rule: RULE.STALE, detail: `certificate.verifiedAt (${cert.verifiedAt}) is in the future` };
  }
  if (now - verifiedAtMs > maxAgeMs) {
    return {
      ok: false,
      rule: RULE.STALE,
      detail: `certificate is stale: verifiedAt ${cert.verifiedAt} is older than maxAgeMs ${maxAgeMs}`,
    };
  }

  // Canonical digest: required and well-formed (opaque reference to the Fleet
  // evidence artifact; the endpoint that produced the certificate may verify it).
  if (typeof cert.canonicalSha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(cert.canonicalSha256)) {
    return { ok: false, rule: RULE.MALFORMED, detail: 'certificate.canonicalSha256 is missing or not a 64-char hex string' };
  }

  return {
    ok: true,
    rule: RULE.PASS,
    detail: `exact fresh ${CERTIFICATE_KIND} certificate for head ${headSha}`,
    cert: { certificate: cert.certificate, pr: cert.pr, exactHeadSha: cert.exactHeadSha, verdict: cert.verdict, verifiedAt: cert.verifiedAt, canonicalSha256: cert.canonicalSha256 },
  };
}

// I/O: read every *.json certificate under <sha>.json naming. Malformed files
// are skipped, which evaluates as "no cert" -> BLOCK (never as a pass).
function readCertificates(directory) {
  if (!directory || !fs.existsSync(directory)) return [];
  let entries = [];
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return [];
  }
  const certs = [];
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(directory, entry), 'utf8').replace(/^\uFEFF/, ''));
      const normalized = normalizeRawCert(raw, path.basename(entry));
      if (normalized) certs.push(normalized);
    } catch {
      // Unparseable certificate file -> contributes no certificate -> BLOCK.
    }
  }
  return certs;
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const headSha = args.find((a) => /^[0-9a-f]{40}$/i.test(a)) || '';
  const flagValue = (name) => {
    const eq = args.find((a) => a.startsWith(`${name}=`));
    if (eq) return eq.slice(name.length + 1);
    const idx = args.indexOf(name);
    if (idx !== -1 && args[idx + 1] !== undefined) return args[idx + 1];
    return null;
  };
  const certDirArg = flagValue('--cert-dir');
  const maxAgeArg = flagValue('--max-age-ms');
  const certDir = certDirArg || path.join(__dirname, '..', 'data', 'fleet-pre-certificates');
  const maxAgeMs = maxAgeArg !== null ? Number(maxAgeArg) : DEFAULT_MAX_AGE_MS;
  return { headSha, certDir, maxAgeMs };
}

function main(argv) {
  const { headSha, certDir, maxAgeMs } = parseArgs(argv);
  if (!isSha(headSha) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) {
    console.log(JSON.stringify({
      certificate: CERTIFICATE_KIND,
      ok: false,
      rule: RULE.MALFORMED,
      detail: 'usage: node scripts/check-fleet-pre-certificate.cjs <40-hex-head-sha> [--cert-dir=<dir>] [--max-age-ms=<ms>]',
    }, null, 2));
    process.exit(1);
  }
  const certificates = readCertificates(certDir);
  const result = evaluateFleetPreCertificate({ headSha, certificates, now: Date.now(), maxAgeMs });
  console.log(JSON.stringify({
    certificate: CERTIFICATE_KIND,
    headSha,
    certificateSource: certDir,
    certificatesFound: certificates.length,
    ok: result.ok,
    rule: result.rule,
    detail: result.detail,
    cert: result.cert || null,
  }, null, 2));
  if (!result.ok) {
    console.error(`[FLEET_PRE] BLOCK: ${result.rule} - ${result.detail}`);
    process.exit(1);
  }
}

if (require.main === module) main(process.argv);

module.exports = {
  CERTIFICATE_KIND,
  REQUIRED_VERDICT,
  DEFAULT_MAX_AGE_MS,
  RULE,
  isSha,
  normalizeRawCert,
  readCertificates,
  evaluateFleetPreCertificate,
  parseArgs,
};