'use strict';

// Fail-closed Ocean integration eligibility.
//
// Issue #80 records the governing relation: "exact-head all-green + independent
// Fleet PRE" is valid evidence only for the exact (head_sha, canonical_base_sha)
// pair, and a later canonical-base advance invalidates integration eligibility
// even when the feature head is unchanged. This module is the single executable
// decision for that relation. It is intentionally pure so CI and the local test
// suite exercise exactly the same code, and it fails closed on every unknown,
// missing, malformed or unverifiable input.

const SHA = /^[0-9a-f]{40}$/;

const FLEET_PRE_KIND = 'FLEET_PRE';
const FLEET_PRE_PASS = 'PASS';

const REJECTION = Object.freeze({
  MISSING_CERTIFICATE: 'missing_fleet_pre_certificate',
  MALFORMED_CERTIFICATE: 'malformed_fleet_pre_certificate',
  WRONG_KIND: 'certificate_is_not_fleet_pre',
  NOT_PASS: 'certificate_verdict_is_not_pass',
  MISSING_HEAD: 'certificate_head_missing_or_invalid',
  MISSING_BASE: 'certificate_canonical_base_missing_or_invalid',
  CANDIDATE_HEAD_MISSING: 'candidate_head_missing_or_invalid',
  CANONICAL_BASE_MISSING: 'canonical_base_missing_or_invalid',
  HEAD_MISMATCH: 'certificate_head_does_not_match_candidate_head',
  STALE_CANONICAL_BASE: 'canonical_base_advanced_after_certification'
});

function normalizeSha(value) {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return SHA.test(text) ? text : '';
}

function parseCertificate(raw) {
  if (raw === null || raw === undefined) return null;
  const text = String(raw).trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { __malformed: true };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { __malformed: true };
  }
  return parsed;
}

// The certificate Fleet PRE publishes for one exact candidate revision.
function buildFleetPreCertificate({
  headSha, canonicalBaseSha, prBaseSha = '', runId = '', scope = 'syntax-and-causal-tests'
} = {}) {
  return {
    kind: FLEET_PRE_KIND,
    sha: normalizeSha(headSha),
    baseSha: normalizeSha(canonicalBaseSha),
    prBaseSha: normalizeSha(prBaseSha),
    runId: String(runId || '').slice(0, 40),
    verdict: FLEET_PRE_PASS,
    scope: String(scope || '').slice(0, 120)
  };
}

function decideOceanEligibility({ certificate, expectedHeadSha, canonicalBaseSha } = {}) {
  const candidateHead = normalizeSha(expectedHeadSha);
  const canonicalBase = normalizeSha(canonicalBaseSha);
  const parsed = parseCertificate(certificate);

  const reject = (reason, detail = {}) => ({
    readyForOcean: false,
    reason,
    candidateHeadSha: candidateHead,
    canonicalBaseSha: canonicalBase,
    certificateSha: '',
    certificateBaseSha: '',
    ...detail
  });

  if (parsed === null) return reject(REJECTION.MISSING_CERTIFICATE);
  if (parsed.__malformed) return reject(REJECTION.MALFORMED_CERTIFICATE);
  if (!candidateHead) return reject(REJECTION.CANDIDATE_HEAD_MISSING);
  if (!canonicalBase) return reject(REJECTION.CANONICAL_BASE_MISSING);
  if (parsed.kind !== FLEET_PRE_KIND) return reject(REJECTION.WRONG_KIND);
  if (parsed.verdict !== FLEET_PRE_PASS) return reject(REJECTION.NOT_PASS);

  const certifiedHead = normalizeSha(parsed.sha);
  const certifiedBase = normalizeSha(parsed.baseSha);
  if (!certifiedHead) return reject(REJECTION.MISSING_HEAD);
  if (!certifiedBase) return reject(REJECTION.MISSING_BASE);

  const identity = {
    certificateSha: certifiedHead,
    certificateBaseSha: certifiedBase,
    certificateRunId: String(parsed.runId || '').slice(0, 40)
  };
  if (certifiedHead !== candidateHead) return reject(REJECTION.HEAD_MISMATCH, identity);
  if (certifiedBase !== canonicalBase) return reject(REJECTION.STALE_CANONICAL_BASE, identity);

  return {
    readyForOcean: true,
    reason: 'exact_head_and_canonical_base_certified',
    candidateHeadSha: candidateHead,
    canonicalBaseSha: canonicalBase,
    ...identity
  };
}

// One line, stable, machine-greppable. Never fabricate eligibility.
function formatEligibility(decision) {
  if (!decision || decision.readyForOcean !== true) {
    return 'READY_FOR_OCEAN=NO REASON=' + String((decision && decision.reason) || 'unknown') +
      (decision && decision.candidateHeadSha ? ' HEAD=' + decision.candidateHeadSha : '') +
      (decision && decision.canonicalBaseSha ? ' CANONICAL_BASE=' + decision.canonicalBaseSha : '');
  }
  return 'READY_FOR_OCEAN=YES HEAD=' + decision.candidateHeadSha +
    ' CANONICAL_BASE=' + decision.canonicalBaseSha + ' RUN=' + (decision.certificateRunId || 'unknown');
}

module.exports = {
  FLEET_PRE_KIND,
  FLEET_PRE_PASS,
  REJECTION,
  normalizeSha,
  parseCertificate,
  buildFleetPreCertificate,
  decideOceanEligibility,
  formatEligibility
};
