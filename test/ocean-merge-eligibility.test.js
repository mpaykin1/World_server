'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const {
  evaluateOceanEligibility,
  INDEPENDENT_REVIEW_CHECK
} = require('../lib/ocean-merge-eligibility.js');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/fleet-pre-exact-sha.yml'), 'utf8');
const gatePath = path.join(__dirname, '../scripts/ocean-merge-eligibility-gate.js');

const HEAD = 'a'.repeat(40);
const BASE = 'b'.repeat(40);
const STALE_BASE = 'c'.repeat(40);

function passReview(headSha = HEAD) {
  return { found: true, head_sha: headSha, status: 'completed', conclusion: 'success', verdict: 'PASS' };
}

// A genuinely eligible exact-head candidate: certified, clean, based on current
// master, and independently reviewed PASS on that same SHA.
function eligibleFacts(overrides = {}) {
  return {
    expectedHeadSha: HEAD,
    certifiedSha: HEAD,
    prNumber: 900,
    baseRef: 'master',
    baseSha: BASE,
    headSha: HEAD,
    draft: false,
    mergeable: true,
    mergeableState: 'clean',
    trustedMasterSha: BASE,
    review: passReview(),
    ...overrides
  };
}

function codes(overrides) {
  return evaluateOceanEligibility(overrides).blockers.map((blocker) => blocker.code);
}

test('a fully proven exact-head candidate is Ocean ready', () => {
  const verdict = evaluateOceanEligibility(eligibleFacts());
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.ready, true);
  assert.equal(verdict.sha, HEAD);
});

test('REGRESSION: certificate SHA alone never certifies a blocked independent review', () => {
  // Exact factory regression seen on #278/#289/#295/#298/#291: the old gate
  // emitted READY_FOR_OCEAN=YES from cert-SHA == head-SHA while the exact-head
  // independent review was FAILURE / ACTION_REQUIRED on that very same head.
  for (const review of [
    { found: true, head_sha: HEAD, status: 'completed', conclusion: 'failure', verdict: 'BLOCK' },
    { found: true, head_sha: HEAD, status: 'completed', conclusion: 'action_required', verdict: 'INCONCLUSIVE' },
    { found: false }
  ]) {
    const verdict = evaluateOceanEligibility(eligibleFacts({ review }));
    assert.equal(verdict.ready, false, 'must not certify without independent PASS');
    assert.equal(verdict.sha, null);
    assert.ok(verdict.blockers.length > 0);
  }
  assert.ok(codes(eligibleFacts({ review: { found: false } })).includes('INDEPENDENT_REVIEW_MISSING'));
  assert.ok(
    codes(eligibleFacts({ review: { found: true, head_sha: HEAD, status: 'completed', conclusion: 'failure', verdict: 'BLOCK' } }))
      .includes('INDEPENDENT_REVIEW_BLOCKED')
  );
  assert.ok(
    codes(eligibleFacts({ review: { found: true, head_sha: HEAD, status: 'completed', conclusion: 'action_required', verdict: 'INCONCLUSIVE' } }))
      .includes('INDEPENDENT_REVIEW_INCONCLUSIVE')
  );
});

test('REGRESSION: a base that is behind master is rejected, not certified', () => {
  assert.ok(codes(eligibleFacts({ baseSha: STALE_BASE })).includes('BASE_NOT_CURRENT_MASTER'));
  assert.ok(codes(eligibleFacts({ baseRef: 'ai/some-branch', baseSha: BASE })).includes('BASE_NOT_PROTECTED_MASTER'));
});

test('independent review must be bound to the exact candidate head', () => {
  assert.ok(codes(eligibleFacts({ review: passReview(STALE_BASE) })).includes('INDEPENDENT_REVIEW_WRONG_SHA'));
});

test('an in-flight independent review blocks instead of defaulting to approval', () => {
  const pending = codes(eligibleFacts({ review: { found: true, head_sha: HEAD, status: 'in_progress', conclusion: null, verdict: null } }));
  assert.ok(pending.includes('INDEPENDENT_REVIEW_NOT_COMPLETED'));
});

test('stale, missing and moved certificates all block', () => {
  assert.ok(codes(eligibleFacts({ certifiedSha: STALE_BASE })).includes('STALE_CERTIFICATE'));
  assert.ok(codes(eligibleFacts({ certifiedSha: null })).includes('MISSING_CERTIFICATE'));
  assert.ok(codes(eligibleFacts({ headSha: STALE_BASE })).includes('PR_HEAD_MISMATCH'));
});

test('drafts and unresolved conflicts block', () => {
  assert.ok(codes(eligibleFacts({ draft: true })).includes('DRAFT_PULL_REQUEST'));
  assert.ok(codes(eligibleFacts({ mergeable: false, mergeableState: 'dirty' })).includes('UNRESOLVED_CONFLICT'));
  // GitHub reports mergeable:null / mergeable_state:"unknown" while computing.
  assert.ok(codes(eligibleFacts({ mergeable: null, mergeableState: 'unknown' })).includes('UNRESOLVED_CONFLICT'));
});

test('every malformed or missing input fails closed', () => {
  for (const input of [null, undefined, 'READY_FOR_OCEAN', 42, {}]) {
    const verdict = evaluateOceanEligibility(input);
    assert.equal(verdict.ready, false, `input ${JSON.stringify(input)} must not certify`);
    assert.ok(verdict.blockers.length > 0);
    assert.equal(verdict.sha, null);
  }
  assert.ok(codes({ expectedHeadSha: 'not-a-sha' }).includes('INVALID_HEAD_SHA'));
  assert.ok(codes({ ...eligibleFacts(), trustedMasterSha: null }).includes('INVALID_TRUSTED_MASTER_SHA'));
  assert.ok(codes({}).includes('NO_PULL_REQUEST_CONTEXT'));
});

test('gate CLI prints the marker only for a proven decision and fails closed otherwise', () => {
  const fsSync = require('node:fs');
  const os = require('node:os');
  const dir = fsSync.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  try {
    const readyFile = path.join(dir, 'ready.json');
    const blockedFile = path.join(dir, 'blocked.json');
    fsSync.writeFileSync(readyFile, JSON.stringify(eligibleFacts()));
    fsSync.writeFileSync(blockedFile, JSON.stringify(eligibleFacts({ review: { found: false } })));

    const ready = spawnSync(process.execPath, [gatePath, readyFile], { encoding: 'utf8' });
    assert.equal(ready.status, 0);
    assert.match(ready.stdout, new RegExp(`READY_FOR_OCEAN=YES SHA=${HEAD}`));

    const blocked = spawnSync(process.execPath, [gatePath, blockedFile], { encoding: 'utf8' });
    assert.equal(blocked.status, 1);
    assert.doesNotMatch(blocked.stdout, /READY_FOR_OCEAN/);
    assert.match(blocked.stderr, /Ocean merge blocked: INDEPENDENT_REVIEW_MISSING/);

    const garbage = spawnSync(process.execPath, [gatePath], { input: 'not json', encoding: 'utf8' });
    assert.equal(garbage.status, 2);
    assert.doesNotMatch(garbage.stdout, /READY_FOR_OCEAN/);
  } finally {
    fsSync.rmSync(dir, { recursive: true, force: true });
  }
});

test('the existing Ocean gate stays wired to the fail-closed decision', () => {
  assert.match(workflow, /name: Ocean merge eligibility/);
  assert.match(workflow, /node scripts\/ocean-merge-eligibility-gate\.js/);
  assert.ok(
    workflow.includes('CHECK_NAME: ' + INDEPENDENT_REVIEW_CHECK),
    'gate must read the same exact-head review check the review workflow publishes'
  );
  assert.match(workflow, /checks: read/);
  assert.match(workflow, /pull-requests: read/);
  assert.match(workflow, /mergeable_state/);
  assert.match(workflow, /git\/ref\/heads\/master/);
});

test('no unconditional READY_FOR_OCEAN marker survives in the workflow', () => {
  const markerLines = workflow
    .split('\n')
    .filter((line) => /echo\s+"?READY_FOR_OCEAN/.test(line));
  assert.deepEqual(markerLines, [], 'READY_FOR_OCEAN may only be emitted by the fail-closed gate script');
});
