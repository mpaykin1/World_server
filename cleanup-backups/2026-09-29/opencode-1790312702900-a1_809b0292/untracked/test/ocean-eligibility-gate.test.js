'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { evaluateOceanEligibility } = require('../scripts/ocean-eligibility-gate.cjs');

const GOOD = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const WORKFLOW = fs.readFileSync(path.join(__dirname, '../.github/workflows/fleet-pre-exact-sha.yml'), 'utf8');

test('gate passes only for an exact-head, master-based, fresh, reviewed PR', () => {
  const verdict = evaluateOceanEligibility({
    expectedSha: GOOD,
    certifiedSha: GOOD,
    baseRef: 'master',
    behindBy: 0,
    reviewConclusion: 'success',
    event: 'pull_request',
  });
  assert.equal(verdict.ok, true);
  assert.equal(verdict.reason, 'READY_FOR_OCEAN');
});

test('stale certificate is blocked even when review is green and base is master', () => {
  for (const certifiedSha of [OTHER, '', null]) {
    const verdict = evaluateOceanEligibility({
      expectedSha: GOOD, certifiedSha, baseRef: 'master', behindBy: 0, reviewConclusion: 'success', event: 'pull_request',
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, certifiedSha === null || String(certifiedSha) === '' ? 'MISSING_CERTIFIED_SHA' : 'STALE_CERTIFICATE');
  }
});

test('missing expected head SHA is blocked', () => {
  const verdict = evaluateOceanEligibility({
    expectedSha: '', certifiedSha: GOOD, baseRef: 'master', behindBy: 0, reviewConclusion: 'success', event: 'pull_request',
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'MISSING_EXPECTED_SHA');
});

test('PR targeting a branch other than master is blocked', () => {
  const verdict = evaluateOceanEligibility({
    expectedSha: GOOD, certifiedSha: GOOD, baseRef: 'feature/x', behindBy: 0, reviewConclusion: 'success', event: 'pull_request',
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'PR_BASE_NOT_MASTER');
});

test('head behind current master is blocked', () => {
  const verdict = evaluateOceanEligibility({
    expectedSha: GOOD, certifiedSha: GOOD, baseRef: 'master', behindBy: 3, reviewConclusion: 'success', event: 'pull_request',
  });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.reason, 'PR_BEHIND_MASTER');
});

test('unknown ahead/behind value blocks closed', () => {
  for (const behindBy of ['', 'x', null, undefined]) {
    const verdict = evaluateOceanEligibility({
      expectedSha: GOOD, certifiedSha: GOOD, baseRef: 'master', behindBy, reviewConclusion: 'success', event: 'pull_request',
    });
    assert.equal(verdict.ok, false);
    assert.equal(verdict.reason, 'UNKNOWN_AHEAD_BEHIND');
  }
});

test('independent review must conclude success at the exact head', () => {
  for (const reviewConclusion of ['failure', 'action_required', 'neutral', 'timed_out', '', 'missing', null]) {
    const verdict = evaluateOceanEligibility({
      expectedSha: GOOD, certifiedSha: GOOD, baseRef: 'master', behindBy: 0, reviewConclusion, event: 'pull_request',
    });
    assert.equal(verdict.ok, false, `review=${reviewConclusion} must block`);
    assert.equal(verdict.reason, 'INDEPENDENT_REVIEW_NOT_PASS');
  }
});

test('non-PR dispatch still enforces certification and freshness but not review', () => {
  const fresh = evaluateOceanEligibility({
    expectedSha: GOOD, certifiedSha: GOOD, baseRef: '', behindBy: 0, reviewConclusion: '', event: 'workflow_dispatch',
  });
  assert.equal(fresh.ok, true);
  assert.equal(fresh.reason, 'CERTIFIED_FRESH_NO_PR');

  const stale = evaluateOceanEligibility({
    expectedSha: GOOD, certifiedSha: GOOD, baseRef: '', behindBy: 2, reviewConclusion: '', event: 'workflow_dispatch',
  });
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'PR_BEHIND_MASTER');

  const badCert = evaluateOceanEligibility({
    expectedSha: GOOD, certifiedSha: OTHER, baseRef: '', behindBy: 0, reviewConclusion: '', event: 'workflow_dispatch',
  });
  assert.equal(badCert.ok, false);
  assert.equal(badCert.reason, 'STALE_CERTIFICATE');
});

test('CLI exits non-zero for a blocked candidate and zero for a ready candidate', () => {
  const script = path.join(__dirname, '../scripts/ocean-eligibility-gate.cjs');
  let blockedOutput = '';
  try {
    execFileSync(process.execPath, [
      script,
      '--expected-sha', GOOD,
      '--certified-sha', GOOD,
      '--base-ref', 'master',
      '--behind-by', '0',
      '--review-conclusion', 'action_required',
      '--event', 'pull_request',
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    assert.fail('blocked candidate must exit non-zero');
  } catch (error) {
    assert.match(String(error.stdout || ''), /^OCEAN_ELIGIBILITY=BLOCK REASON=INDEPENDENT_REVIEW_NOT_PASS/);
    blockedOutput = String(error.stdout || '');
  }
  assert.match(blockedOutput, /^OCEAN_ELIGIBILITY=BLOCK/);

  const ready = execFileSync(process.execPath, [
    script,
    '--expected-sha', GOOD,
    '--certified-sha', GOOD,
    '--base-ref', 'master',
    '--behind-by', '0',
    '--review-conclusion', 'success',
    '--event', 'pull_request',
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).split('\n')[0];
  assert.match(ready, /^OCEAN_ELIGIBILITY=PASS REASON=READY_FOR_OCEAN/);
});

test('workflow regression guard: ocean-eligibility fails closed on review, base and freshness', () => {
  assert.match(WORKFLOW, /World Independent Adversarial Review/);
  assert.match(WORKFLOW, /node scripts\/ocean-eligibility-gate\.cjs/);
  assert.match(WORKFLOW, /--review-conclusion/);
  assert.match(WORKFLOW, /--behind-by/);
  assert.match(WORKFLOW, /--base-ref/);
  assert.match(WORKFLOW, /--expected-sha/);
  assert.match(WORKFLOW, /check-runs/);
  assert.match(WORKFLOW, /git\/ref\/heads\/master/);
  assert.match(WORKFLOW, /compare\/\$\{TRUSTED\}\.\.\.\$\{EXPECTED\}/);
  // The gate must never certify from the SHA match alone.
  assert.doesNotMatch(WORKFLOW, /echo "READY_FOR_OCEAN=YES SHA=\$CERTIFIED"/);
});