'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  baselineCoverage,
  isSyntheticEvidence,
  isProductionRigSample,
  productionRigCoverage,
  evaluateProductionCertification,
  certifiedReadiness
} = require('../scripts/world-quality-analyzer');

test('100% requires every declared visual baseline, not just one', () => {
  const candidates = { candidates: [{ id: 'a' }, { id: 'b' }] };
  const one = baselineCoverage(
    { approvedBaselines: [{ id: 'a', status: 'APPROVED' }] },
    candidates
  );
  assert.equal(one.required, 2);
  assert.equal(one.approved, 1);
  assert.equal(one.complete, false);

  const all = baselineCoverage(
    { approvedBaselines: [
      { id: 'a', status: 'APPROVED' },
      { id: 'b', status: 'APPROVED' }
    ] },
    candidates
  );
  assert.equal(all.complete, true);
});

test('synthetic animation evidence can never certify production runtime', () => {
  const synthetic = {
    id: 'synthetic-rig-1',
    source: 'local-test-synthetic',
    productionEligible: true,
    skeletonMap: { a:1,b:2,c:3,d:4,e:5,f:6 },
    constraints: {}
  };
  assert.equal(isSyntheticEvidence(synthetic), true);
  assert.equal(isProductionRigSample(synthetic), false);

  const real = {
    id: 'generated-character-1',
    source: 'production-runtime-capture',
    productionEligible: true,
    skeletonMap: { Hips:1,Spine:2,Head:3,LeftFoot:4,RightFoot:5,LeftHand:6,RightHand:7 },
    constraints: { footSlideMetersPerSecond: 0.05 }
  };
  assert.equal(isSyntheticEvidence(real), false);
  assert.equal(isProductionRigSample(real), true);
  assert.equal(productionRigCoverage({ samples: [synthetic, real] }).complete, true);
});

test('production certification fails closed when any proof is missing', () => {
  const blocked = evaluateProductionCertification({
    baseline: { required: 6, approved: 5, complete: false },
    rig: { real: 1, complete: true },
    deviceProviderConfigured: true,
    deviceEvidencePercent: 100,
    devicePhysicalProvider: true,
    requiredCiPass: true
  });

  assert.equal(blocked.ready, false);
  assert.deepEqual(blocked.blockers, ['all-visual-baselines-approved']);
  assert.equal(certifiedReadiness(100, blocked), 99);
});

test('100% is allowed only when baseline, real device, real rig and required CI all pass', () => {
  const certified = evaluateProductionCertification({
    baseline: { required: 6, approved: 6, complete: true },
    rig: { real: 1, complete: true },
    deviceProviderConfigured: true,
    deviceEvidencePercent: 100,
    devicePhysicalProvider: true,
    requiredCiPass: true
  });

  assert.equal(certified.ready, true);
  assert.equal(certified.evidencePercent, 100);
  assert.equal(certifiedReadiness(100, certified), 100);
});
