'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { finalizeVerification } = require('../scripts/task-integrity.cjs');

function aggregate() {
  return {
    telemetry_balanced: true, measurement_verified: false,
    latest_artifacts: { CLEAN_SERVER: null, 'GRAPHICS-DEMO-001': null },
    status: 'TELEMETRY_BALANCED_UNVERIFIED', ok: true,
    recovery_action: null
  };
}
test('bounded evidence-cap exhaustion is explicit and never counted as verified 50/50', () => {
  const result = finalizeVerification(aggregate(), [
    { status: 'CONTENT_VERIFIED' },
    { status: 'CONTENT_UNVERIFIED', reason: 'EVIDENCE_CHECK_LIMIT_REACHED' }
  ]);
  assert.equal(result.evidence_check_limit_reached, true);
  assert.equal(result.evidence_verified, false);
  assert.equal(result.verification_pass, false);
  assert.equal(result.status, 'TELEMETRY_BALANCED_UNVERIFIED');
  assert.match(result.recovery_action, /EVIDENCE_CHECK_LIMIT_REACHED/);
});
test('INVALID evidence takes precedence over any attested balance', () => {
  const result = finalizeVerification(aggregate(), [
    { status: 'INVALID', reason: 'HASH_REF_MISMATCH' }
  ]);
  assert.equal(result.status, 'INVALID_EVIDENCE');
  assert.equal(result.ok, false);
  assert.equal(result.verification_pass, false);
  assert.equal(result.evidence_check_limit_reached, false);
});
