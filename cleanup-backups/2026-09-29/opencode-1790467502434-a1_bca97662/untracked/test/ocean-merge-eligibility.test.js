'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { decideOceanMergeEligibility, findReviewConclusion, normaliseDraft,
  REVIEW_CHECK_NAME, ONLY_ELIGIBLE_REVIEW } = require('../scripts/ocean-merge-eligibility.cjs');

const head = 'a'.repeat(40);
const base = 'b'.repeat(40);
const master = 'c'.repeat(40);
const cert = head;

const clean = { headSha: head, certSha: cert, reviewConclusion: ONLY_ELIGIBLE_REVIEW,
  baseSha: base, masterSha: base, isDraft: false };

// BEFORE (reproduced on master bca97662): the job asserted only
// `test "$CERTIFIED" = "$EXPECTED"`. In the case below that shell assertion is
// true, so master printed READY_FOR_OCEAN=YES beside a red independent review.
const beforeCase = { ...clean, reviewConclusion: 'failure' };
const beforeShellAssertion = cp => cp === cert; // the entire pre-fix decision

test('BEFORE falsification: certified head plus independent BLOCK is not eligible', () => {
  assert.equal(beforeShellAssertion(cert), true, 'pre-fix shell assertion passed this candidate');
  const decision = decideOceanMergeEligibility(beforeCase);
  assert.equal(decision.eligible, false);
  assert.equal(decision.reasons.length, 1);
  assert.match(decision.reasons[0], new RegExp(REVIEW_CHECK_NAME));
  assert.match(decision.reasons[0], /concluded failure/);
});

test('every non-success independent verdict, including absence, is ineligible', () => {
  for (const conclusion of ['failure', 'action_required', 'neutral', 'cancelled',
    'timed_out', 'skipped', 'stale', 'PASS', '', null, undefined, '  FAILURE ']) {
    const decision = decideOceanMergeEligibility({ ...clean, reviewConclusion: conclusion });
    assert.equal(decision.eligible, false, 'must not accept review conclusion ' + JSON.stringify(conclusion));
    assert.match(decision.reasons.join(' '), /independent review/);
  }
});

test('stale base, unknown base and unknown master are ineligible', () => {
  const stale = decideOceanMergeEligibility({ ...clean, baseSha: base, masterSha: master });
  assert.equal(stale.eligible, false);
  assert.match(stale.reasons.join(' '), /behind current master/);
  assert.equal(decideOceanMergeEligibility({ ...clean, baseSha: '' }).eligible, false);
  assert.equal(decideOceanMergeEligibility({ ...clean, masterSha: undefined }).eligible, false);
  assert.equal(decideOceanMergeEligibility({ ...clean, baseSha: base, masterSha: 'nope' }).eligible, false);
});

test('drafts and unknown draft state are ineligible', () => {
  assert.equal(decideOceanMergeEligibility({ ...clean, isDraft: true }).eligible, false);
  assert.equal(decideOceanMergeEligibility({ ...clean, isDraft: 'true' }).eligible, false);
  assert.equal(decideOceanMergeEligibility({ ...clean, isDraft: 'false' }).eligible, true);
  assert.equal(decideOceanMergeEligibility({ ...clean, isDraft: undefined }).eligible, false);
  assert.equal(decideOceanMergeEligibility({ ...clean, isDraft: 'maybe' }).eligible, false);
  assert.equal(normaliseDraft('maybe').known, false);
});

test('certificate must equal the exact candidate head', () => {
  const mismatch = decideOceanMergeEligibility({ ...clean, certSha: 'd'.repeat(40) });
  assert.equal(mismatch.eligible, false);
  assert.match(mismatch.reasons.join(' '), /does not match candidate head/);
  assert.equal(decideOceanMergeEligibility({ ...clean, certSha: '' }).eligible, false);
  assert.equal(decideOceanMergeEligibility({ ...clean, headSha: 'abc' }).eligible, false);
  assert.equal(decideOceanMergeEligibility({}).eligible, false);
  assert.equal(decideOceanMergeEligibility().eligible, false);
});

test('an all-clean exact-head candidate is eligible with no reasons', () => {
  const decision = decideOceanMergeEligibility(clean);
  assert.deepEqual(decision, { eligible: true, reasons: [] });
});

test('review conclusion is read from the named check-run only', () => {
  const payload = { check_runs: [
    { id: 1, name: 'check', status: 'completed', conclusion: 'failure' },
    { id: 2, name: REVIEW_CHECK_NAME, status: 'completed', conclusion: 'success' },
    { id: 3, name: REVIEW_CHECK_NAME, status: 'in_progress', conclusion: null }
  ]};
  assert.equal(findReviewConclusion(payload), 'success');
  assert.equal(findReviewConclusion({ check_runs: [{ id: 9, name: REVIEW_CHECK_NAME, status: 'queued' }] }), '');
  assert.equal(findReviewConclusion({ check_runs: [{ id: 9, name: 'other', status: 'completed', conclusion: 'success' }] }), null);
  assert.equal(findReviewConclusion({}), null);
  assert.equal(findReviewConclusion(null), null);
  assert.equal(findReviewConclusion({ check_runs: [
    { id: 5, name: REVIEW_CHECK_NAME, status: 'completed', conclusion: 'failure' },
    { id: 8, name: REVIEW_CHECK_NAME, status: 'completed', conclusion: 'success' }] }), 'success');
});

test('an unreadable check-runs payload is treated as absent, never as approval', () => {
  const unreadable = decideOceanMergeEligibility({ ...clean, reviewConclusion: findReviewConclusion(null) });
  assert.equal(unreadable.eligible, false);
  assert.match(unreadable.reasons.join(' '), /absence is not approval/);
});
