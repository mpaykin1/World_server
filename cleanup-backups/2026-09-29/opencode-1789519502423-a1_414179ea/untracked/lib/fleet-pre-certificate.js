'use strict';

const fs = require('node:fs');
const path = require('node:path');

const CERT_SCHEMA_VERSION = '1';
const REQUIRED_ROLE = 'FLEET_PRE';
const REQUIRED_STAGE = 'PRE_INTEGRATION_QA';
const READY_VERDICT = 'READY_FOR_OCEAN';
const READY_STATUS = 'yes';
const CERT_FILE_PREFIX = 'fleet-pre-';
const DEFAULT_MAX_AGE_MS = 48 * 60 * 60 * 1000;
const FUTURE_SKEW_MS = 5 * 60 * 1000;
const SHA_RE = /^[0-9a-f]{40}$/;

function normalize(value) {
  return String(value == null ? '' : value).trim().toLowerCase();
}

function isValidSha(value) {
  return SHA_RE.test(normalize(value));
}

function parseCertificate(text) {
  let cert;
  try {
    cert = JSON.parse(text);
  } catch {
    return { ok: false, error: 'UNPARSEABLE_CERTIFICATE' };
  }
  if (!cert || typeof cert !== 'object' || Array.isArray(cert)) {
    return { ok: false, error: 'UNPARSEABLE_CERTIFICATE' };
  }
  return { ok: true, cert };
}

function validateCertificate({
  headSha,
  cert,
  baseSha = null,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  now = Date.now(),
  certifierMustNotEqual = null,
}) {
  const errors = [];
  const expectedSha = normalize(headSha);
  if (!isValidSha(expectedSha)) errors.push('INVALID_HEAD_SHA');
  if (!cert || typeof cert !== 'object' || Array.isArray(cert)) {
    errors.push('MISSING_CERTIFICATE');
    return { ok: false, errors, certificate: null };
  }
  const certSha = normalize(cert.headSha);
  if (String(cert.schemaVersion) !== CERT_SCHEMA_VERSION) errors.push('SCHEMA_VERSION_UNSUPPORTED');
  if (normalize(cert.role) !== normalize(REQUIRED_ROLE)) errors.push('WRONG_ROLE');
  if (normalize(cert.stage) !== normalize(REQUIRED_STAGE)) errors.push('WRONG_STAGE');
  if (normalize(cert.verdict) !== normalize(READY_VERDICT)) errors.push('NOT_READY_FOR_OCEAN');
  if (normalize(cert.status) !== normalize(READY_STATUS)) errors.push('NOT_READY_FOR_OCEAN');
  if (!isValidSha(certSha)) errors.push('UNPARSEABLE_CERT_HEAD_SHA');
  else if (certSha !== expectedSha) errors.push('SHA_MISMATCH');
  if (baseSha) {
    if (!isValidSha(baseSha)) errors.push('UNPARSEABLE_BASE_SHA');
    else if (!isValidSha(cert.baseSha)) errors.push('UNPARSEABLE_CERT_BASE_SHA');
    else if (normalize(cert.baseSha) !== normalize(baseSha)) errors.push('BASE_SHA_MISMATCH');
  } else if (cert.baseSha && isValidSha(cert.baseSha)) {
    // No base constraint requested; a well-formed base field is harmless.
  }
  const certificateId = String(cert.certificateId || '');
  if (certificateId.length < 16) errors.push('INVALID_CERTIFICATE_ID');
  const certifiedAt = Date.parse(String(cert.certifiedAt || ''));
  if (!Number.isFinite(certifiedAt)) errors.push('UNPARSEABLE_CERTIFIED_AT');
  else {
    if (certifiedAt > now + FUTURE_SKEW_MS) errors.push('FUTURE_CERTIFICATE');
    else if (now - certifiedAt > maxAgeMs) errors.push('STALE_CERTIFICATE');
  }
  if (
    certifierMustNotEqual &&
    normalize(cert.certifier || cert.issuer || '') === normalize(certifierMustNotEqual)
  ) {
    errors.push('SELF_CERTIFIED');
  }
  return { ok: errors.length === 0, errors, certificate: cert };
}

function gateCertificateStore({
  dir,
  headSha,
  baseSha = null,
  maxAgeMs = DEFAULT_MAX_AGE_MS,
  now = Date.now(),
  certifierMustNotEqual = null,
}) {
  const errors = [];
  const sha = normalize(headSha);
  if (!isValidSha(sha)) {
    return { ok: false, errors: ['INVALID_HEAD_SHA'], certificate: null, files: [] };
  }
  let jsonFiles = [];
  if (fs.existsSync(dir)) {
    let entries;
    try {
      entries = fs.readdirSync(dir);
    } catch {
      return {
        ok: false,
        errors: ['MISSING_CERTIFICATE_DIR'],
        certificate: null,
        files: [],
      };
    }
    jsonFiles = entries.filter((name) => name.endsWith('.json')).sort();
  }
  const parsed = [];
  for (const file of jsonFiles) {
    let text;
    try {
      text = fs.readFileSync(path.join(dir, file), 'utf8');
    } catch {
      continue;
    }
    const result = parseCertificate(text);
    if (!result.ok) {
      errors.push(`UNPARSEABLE_CERTIFICATE:${file}`);
      continue;
    }
    parsed.push(result.cert);
  }

  const matching = parsed.filter((cert) => normalize(cert.headSha) === sha);
  if (matching.length === 0) {
    const expectedFile = `${CERT_FILE_PREFIX}${sha}.json`;
    if (jsonFiles.includes(expectedFile)) errors.push('SHA_MISMATCH');
    else errors.push('MISSING_CERTIFICATE');
    return { ok: false, errors, certificate: null, files: jsonFiles };
  }
  if (matching.length > 1) {
    errors.push('DUPLICATE_CERTIFICATE');
    return { ok: false, errors, certificate: null, files: jsonFiles };
  }

  const verdict = validateCertificate({
    headSha,
    cert: matching[0],
    baseSha,
    maxAgeMs,
    now,
    certifierMustNotEqual,
  });
  if (!verdict.ok) errors.push(...verdict.errors);
  return { ok: errors.length === 0, errors, certificate: verdict.certificate, files: jsonFiles };
}

module.exports = {
  CERT_SCHEMA_VERSION,
  CERT_FILE_PREFIX,
  DEFAULT_MAX_AGE_MS,
  FUTURE_SKEW_MS,
  READY_STATUS,
  READY_VERDICT,
  REQUIRED_ROLE,
  REQUIRED_STAGE,
  gateCertificateStore,
  isValidSha,
  normalize,
  parseCertificate,
  validateCertificate,
};