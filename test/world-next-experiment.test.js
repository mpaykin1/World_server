'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { planNextExperiment } = require('../scripts/world-next-experiment.cjs');

const example = { candidates: [
  { id: 'mobile-0', tier: 'mobile', predictedQuality: 70, predictedCost: 70, detailRadius: 1, maxDpr: 1 },
  { id: 'mobile-0p08', tier: 'mobile', predictedQuality: 77, predictedCost: 76, detailRadius: 1.08, maxDpr: 1.08 },
  { id: 'mobile--0p08', tier: 'mobile', predictedQuality: 64, predictedCost: 65, detailRadius: .92, maxDpr: .92 },
  { id: 'desktop-0', tier: 'desktop', predictedQuality: 90, predictedCost: 85, detailRadius: 1, maxDpr: 1 },
  { id: 'desktop-0p08', tier: 'desktop', predictedQuality: 101, predictedCost: 104, detailRadius: 1.08, maxDpr: 1.08 }
]};
test('prioritizes measurable gain against same-tier counterfactual', () => {
  const plan = planNextExperiment(example);
  assert.equal(plan.status, 'PROPOSED_UNVERIFIED');
  assert.equal(plan.candidate.id, 'mobile-0p08');
  assert.equal(plan.candidate.baseline, 'mobile-0');
  assert.equal(plan.notYetProven, true);
  assert.equal(plan.mutationAllowed, false);
  assert.match(plan.experiment.counterfactual, /same seed/);
  assert.match(plan.experiment.requiredEvidence.join(' '), /85%/);
});
test('rejects candidate with only predicted gain at excessive cost', () => {
  const plan = planNextExperiment({ candidates: example.candidates.filter(x => x.tier === 'desktop') });
  assert.equal(plan.status, 'NO_VALID_EXPERIMENT');
  assert.equal(plan.candidate, null);
});
test('missing evidence does not fabricate any experiment', () => {
  const plan = planNextExperiment(null);
  assert.equal(plan.status, 'NO_VALID_EXPERIMENT');
  assert.equal(plan.experiment, null);
  assert.match(plan.inputSha256, /^[a-f0-9]{64}$/);
});
test('tie is deterministic and proposals never auto-merge', () => {
  const extra = example.candidates.filter(x => x.tier === 'mobile').map(x => ({ ...x, tier: 'tablet', id: x.id.replace('mobile', 'tablet') }));
  const data = { candidates: [...example.candidates, ...extra] };
  const a = planNextExperiment(data), b = planNextExperiment(data);
  assert.equal(a.candidate.id, b.candidate.id);
  assert.equal(a.inputSha256, b.inputSha256);
  assert.equal(a.mutationAllowed, false);
});
