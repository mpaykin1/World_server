'use strict';

// Regression tests for the Ocean protected integration gate.
//
// The defect these lock down is live and observable, not hypothetical. On
// 2026-09-26, open PR #311 at head 403c523562d9dabe3dce7d291d120b4afc6c21d1
// reported, simultaneously:
//   * `World Independent Adversarial Review` -> status=completed,
//     conclusion=failure, output "Independent review: BLOCK"
//   * `Ocean merge eligibility`               -> pass  (READY_FOR_OCEAN=YES)
// with base=master, mergeable=MERGEABLE, draft=false, trusted master
// 809b0292b26edb1ea320e61144f1b1dfed772922.
//
// The old gate certified YES from certificate-SHA == head-SHA alone, so a
// BLOCKed review still produced "ready". Every test below is a blocker the
// gate must emit instead. Nothing here asserts a positive control by
// construction: each positive test states the full fact set that OCEAN accepts.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cp = require('child_process');

const gate = require('../lib/ocean-merge-eligibility.js');

// Live-observed facts for the false-ready PR #311.
const OBSERVED_HEAD = '403c523562d9dabe3dce7d291d120b4afc6c21d1';
const OBSERVED_MASTER = '809b0292b26edb1ea320e61144f1b1dfed772922';

const OTHER_HEAD = '3447609653618a7ee910542be1fb70ec3e8db13b';
const OTHER_MASTER = '1a2b3c4d5e6f708192a3b4c5d6e7f8091a2b3c4d';

function certificate({ headSha = OBSERVED_HEAD, baseSha = OBSERVED_MASTER, verdict = 'PASS', runId = '1', kind = 'FLEET_PRE' } = {}) {
  return { kind, sha: headSha, baseSha, runId, verdict, scope: 'syntax-and-causal-tests' };
}

function facts(overrides = {}) {
  const base = {
    expectedHeadSha: OBSERVED_HEAD,
    trustedMasterSha: OBSERVED_MASTER,
    certificate: certificate(),
    pr: {
      number: 311,
      baseRef: 'master',
      baseSha: OBSERVED_MASTER,
      headSha: OBSERVED_HEAD,
      draft: false,
      mergeable: true,
      mergeableState: 'clean'
    },
    review: {
      found: true,
      head_sha: OBSERVED_HEAD,
      status: 'completed',
      conclusion: 'success',
      verdict: 'PASS'
    },
    siblingGateModules: [gate.OCEAN_GATE_MODULE]
  };
  return { ...base, ...overrides };
}

function codes(overrides) {
  return gate.evaluateOceanEligibility(facts(overrides)).blockerCodes;
}

test('positive control: exact-current-head, clean, PASS review is Ocean ready', () => {
  const decision = gate.evaluateOceanEligibility(facts());
  assert.equal(decision.ready, true);
  assert.deepEqual(decision.blockers, []);
  assert.equal(decision.candidateSha, OBSERVED_HEAD);
  assert.equal(decision.rollbackSha, OBSERVED_MASTER);
  assert.match(gate.formatEligibility(decision), /^READY_FOR_OCEAN=YES CANDIDATE=403c5235/);
});

test('regression: observed PR #311 BLOCKed review must not be Ocean ready', () => {
  // The exact live fact set that produced "Ocean merge eligibility = pass".
  const decision = gate.evaluateOceanEligibility(facts({
    review: {
      found: true,
      head_sha: OBSERVED_HEAD,
      status: 'completed',
      conclusion: 'failure',
      verdict: 'BLOCK'
    }
  }));
  assert.equal(decision.ready, false);
  assert.ok(decision.blockerCodes.includes('INDEPENDENT_REVIEW_BLOCKED'));
  // A blocked candidate must never be given an integration SHA.
  assert.equal(decision.candidateSha, null);
  assert.match(gate.formatEligibility(decision), /^READY_FOR_OCEAN=NO BLOCKERS=.*INDEPENDENT_REVIEW_BLOCKED/);
});

test('an inconclusive independent review is a blocker, never approval', () => {
  assert.ok(codes({
    review: { found: true, head_sha: OBSERVED_HEAD, status: 'completed', conclusion: 'action_required' }
  }).includes('INDEPENDENT_REVIEW_INCONCLUSIVE'));
});

test('a review bound to a different SHA is not evidence for this candidate', () => {
  assert.ok(codes({
    review: { found: true, head_sha: OTHER_HEAD, status: 'completed', conclusion: 'success', verdict: 'PASS' }
  }).includes('INDEPENDENT_REVIEW_WRONG_SHA'));
});

test('a queued or in-progress review is not a completed review', () => {
  assert.ok(codes({
    review: { found: true, head_sha: OBSERVED_HEAD, status: 'in_progress' }
  }).includes('INDEPENDENT_REVIEW_NOT_COMPLETED'));
});

test('an absent independent review is a blocker', () => {
  assert.ok(codes({ review: { found: false } }).includes('INDEPENDENT_REVIEW_MISSING'));
});

test('regression: observed PR #278 base behind master must not be Ocean ready', () => {
  // #278 real shape: mergeStateStatus=BEHIND while mergeable=MERGEABLE.
  const decision = gate.evaluateOceanEligibility(facts({
    expectedHeadSha: OTHER_HEAD,
    trustedMasterSha: OBSERVED_MASTER,
    certificate: certificate({ headSha: OTHER_HEAD, baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
    pr: {
      number: 278,
      baseRef: 'master',
      baseSha: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      headSha: OTHER_HEAD,
      draft: false,
      mergeable: true,
      mergeableState: 'behind'
    },
    review: { found: true, head_sha: OTHER_HEAD, status: 'completed', conclusion: 'success', verdict: 'PASS' }
  }));
  assert.equal(decision.ready, false);
  assert.ok(decision.blockerCodes.includes('STALE_CANONICAL_BASE'));
  assert.ok(decision.blockerCodes.includes('BASE_NOT_CURRENT_MASTER'));
  assert.ok(decision.blockerCodes.includes('UNRESOLVED_CONFLICT'));
});

test('regression: observed draft PRs #289/#295/#298 must not be Ocean ready', () => {
  assert.ok(codes({
    pr: { ...facts().pr, number: 289, draft: true }
  }).includes('DRAFT_PULL_REQUEST'));
});

test('a certificate that passed for an older head is stale', () => {
  assert.ok(codes({ certificate: certificate({ headSha: OTHER_HEAD }) }).includes('STALE_CERTIFICATE'));
});

test('a certificate issued against an advanced base is stale even when the head is unchanged', () => {
  // Issue #80 relation: a later canonical-base advance invalidates eligibility
  // even though the feature head never moved.
  const decision = gate.evaluateOceanEligibility(facts({ trustedMasterSha: OTHER_MASTER }));
  assert.equal(decision.ready, false);
  assert.ok(decision.blockerCodes.includes('STALE_CANONICAL_BASE'));
});

test('a missing, malformed or wrong-kind certificate is never a pass', () => {
  assert.ok(codes({ certificate: null }).includes('MISSING_CERTIFICATE'));
  assert.ok(codes({ certificate: 'not json at all' }).includes('MALFORMED_CERTIFICATE'));
  assert.ok(codes({ certificate: certificate({ kind: 'SELF_REPORTED' }) }).includes('CERTIFICATE_NOT_FLEET_PRE'));
  assert.ok(codes({ certificate: certificate({ verdict: 'PASS_MAYBE' }) }).includes('CERTIFICATE_NOT_PASS'));
  assert.ok(codes({ certificate: { kind: 'FLEET_PRE', verdict: 'PASS' } }).includes('CERTIFICATE_HEAD_MISSING'));
});

test('a certificate string is accepted when it parses to the same object', () => {
  const decision = gate.evaluateOceanEligibility(facts({ certificate: JSON.stringify(certificate()) }));
  assert.equal(decision.ready, true);
});

test('a PR head that moved after the gate was queued requires a fresh run', () => {
  assert.ok(codes({
    pr: { ...facts().pr, headSha: OTHER_HEAD }
  }).includes('PR_HEAD_MISMATCH'));
});

test('a non-master base branch is refused', () => {
  assert.ok(codes({
    pr: { ...facts().pr, baseRef: 'feature/side' }
  }).includes('BASE_NOT_PROTECTED_MASTER'));
});

test('an unknown or false mergeable state is an unresolved conflict', () => {
  assert.ok(codes({
    pr: { ...facts().pr, mergeableState: 'dirty' }
  }).includes('UNRESOLVED_CONFLICT'));
  assert.ok(codes({
    pr: { ...facts().pr, mergeable: null, mergeableState: 'unknown' }
  }).includes('UNRESOLVED_CONFLICT'));
});

test('integration without a resolvable rollback identity is refused', () => {
  assert.ok(codes({ trustedMasterSha: '' }).includes('ROLLBACK_MISSING'));
  assert.ok(codes({ trustedMasterSha: 'master' }).includes('ROLLBACK_MISSING'));
});

test('an invalid candidate head is refused before anything else is trusted', () => {
  const decision = gate.evaluateOceanEligibility(facts({ expectedHeadSha: 'HEAD' }));
  assert.equal(decision.ready, false);
  assert.ok(decision.blockerCodes.includes('INVALID_HEAD_SHA'));
  assert.equal(decision.candidateSha, null);
});

test('no pull request context is a blocker, not an implicit pass', () => {
  assert.ok(codes({ pr: null }).includes('NO_PULL_REQUEST_CONTEXT'));
  assert.ok(codes({ pr: {} }).includes('NO_PULL_REQUEST_CONTEXT'));
});

test('a second module claiming the Ocean gate role is a duplicate parallel system', () => {
  // This is the exact condition observed in this session: two local-only
  // branches each independently implemented the same Ocean gate.
  assert.ok(codes({
    siblingGateModules: [gate.OCEAN_GATE_MODULE, 'lib/ocean-integration-gate.js']
  }).includes('DUPLICATE_PARALLEL_SYSTEM'));
  assert.ok(codes({
    siblingGateModules: [gate.OCEAN_GATE_MODULE, 'lib/ocean-integration-gate.js', 'scripts/ocean-merge-eligibility-gate.js']
  }).includes('DUPLICATE_PARALLEL_SYSTEM'));
});

test('the canonical gate alone is not treated as a duplicate', () => {
  assert.equal(gate.evaluateOceanEligibility(facts()).ready, true);
});

test('every blocker has a non-empty operator-readable message', () => {
  for (const [code, message] of Object.entries(gate.BLOCKER_MESSAGES)) {
    assert.equal(typeof message, 'string', code);
    assert.ok(message.trim().length > 10, `${code} message is not actionable`);
  }
});

test('an empty fact set is refused and names its blockers', () => {
  const decision = gate.evaluateOceanEligibility({});
  assert.equal(decision.ready, false);
  assert.ok(decision.blockerCodes.includes('ROLLBACK_MISSING'));
  assert.ok(decision.blockerCodes.includes('MISSING_CERTIFICATE'));
  assert.ok(decision.blockerCodes.includes('NO_PULL_REQUEST_CONTEXT'));
  assert.match(gate.formatEligibility(decision), /^READY_FOR_OCEAN=NO /);
});

test('formatEligibility never prints YES for a non-ready decision', () => {
  assert.match(gate.formatEligibility(null), /READY_FOR_OCEAN=NO/);
  assert.match(gate.formatEligibility({ ready: false, blockerCodes: [] }), /READY_FOR_OCEAN=NO/);
  assert.match(gate.formatEligibility({ ready: true, candidateSha: OBSERVED_HEAD, rollbackSha: OBSERVED_MASTER }), /READY_FOR_OCEAN=YES/);
});

test('handoff requires the full Ocean -> Fleet identity, rollback, deployment and POST scenarios', () => {
  const complete = gate.buildIntegrationHandoff({
    candidateSha: OBSERVED_HEAD,
    integratedSha: OBSERVED_MASTER,
    previousLkgSha: OTHER_MASTER,
    rollbackSha: OTHER_MASTER,
    deploymentIdentity: 'world-server production',
    deploymentUrl: 'https://world-server.ai.studio',
    postScenarios: [{ id: 'chain-intent', method: 'POST', path: '/api/voxel', expect: '200' }]
  });
  assert.equal(complete.handedOff, true);
  assert.equal(complete.handoff.rollbackSha, OTHER_MASTER);

  const partial = gate.buildIntegrationHandoff({ candidateSha: OBSERVED_HEAD });
  assert.equal(partial.handedOff, false);
  for (const expected of ['INTEGRATED_SHA', 'PREVIOUS_LKG', 'ROLLBACK', 'DEPLOYMENT_IDENTITY', 'DEPLOYMENT_URL', 'POST_SCENARIOS']) {
    assert.ok(partial.missing.includes(expected), `expected missing ${expected}`);
  }
});

test('a POST scenario without id/method/path/expect is not a handable scenario', () => {
  const result = gate.buildIntegrationHandoff({
    candidateSha: OBSERVED_HEAD,
    integratedSha: OBSERVED_MASTER,
    previousLkgSha: OTHER_MASTER,
    rollbackSha: OTHER_MASTER,
    deploymentIdentity: 'x',
    deploymentUrl: 'https://example.invalid',
    postScenarios: [{ id: 'a', method: 'POST', path: '/api/voxel' }]
  });
  assert.equal(result.handedOff, false);
  assert.ok(result.missing.includes('POST_SCENARIO_INCOMPLETE'));
});

test('Ocean never hands off a live self-certification claim', () => {
  const result = gate.buildIntegrationHandoff({
    candidateSha: OBSERVED_HEAD,
    integratedSha: OBSERVED_MASTER,
    previousLkgSha: OTHER_MASTER,
    rollbackSha: OTHER_MASTER,
    deploymentIdentity: 'x',
    deploymentUrl: 'https://example.invalid',
    liveSelfCertified: true,
    postScenarios: [{ id: 'a', method: 'POST', path: '/p', expect: '200' }]
  });
  assert.equal(result.handedOff, false);
  assert.ok(result.missing.includes('SELF_CERTIFIED_LIVE'));
});

test('CLI fails closed on a blocked candidate and writes evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  const factsPath = path.join(dir, 'facts.json');
  const evidencePath = path.join(dir, 'ocean-evidence.json');
  fs.writeFileSync(factsPath, JSON.stringify(facts({
    review: { found: true, head_sha: OBSERVED_HEAD, status: 'completed', conclusion: 'failure', verdict: 'BLOCK' }
  })));
  const result = cp.spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'ocean-merge-eligibility-gate.js'),
    '--facts', factsPath, '--evidence', evidencePath
  ], { encoding: 'utf8' });
  assert.equal(result.status, 6);
  assert.match(result.stdout, /READY_FOR_OCEAN=NO/);
  const evidence = JSON.parse(fs.readFileSync(evidencePath, 'utf8'));
  assert.equal(evidence.readyForOcean, false);
  assert.equal(evidence.candidateSha, null);
  assert.ok(evidence.blockers.some((b) => b.code === 'INDEPENDENT_REVIEW_BLOCKED'));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI succeeds only for a fully eligible candidate', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  const factsPath = path.join(dir, 'facts.json');
  fs.writeFileSync(factsPath, JSON.stringify(facts()));
  const result = cp.spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'ocean-merge-eligibility-gate.js'),
    '--facts', factsPath
  ], { encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.match(result.stdout, new RegExp(`READY_FOR_OCEAN=YES CANDIDATE=${OBSERVED_HEAD}`));
  assert.match(result.stdout, new RegExp(`ROLLBACK=${OBSERVED_MASTER}`));
  fs.rmSync(dir, { recursive: true, force: true });
});

test('CLI refuses to run without usable facts', () => {
  const result = cp.spawnSync(process.execPath, [
    path.join(__dirname, '..', 'scripts', 'ocean-merge-eligibility-gate.js')
  ], { encoding: 'utf8' });
  assert.equal(result.status, 7);
});

test('the real repository exposes exactly one Ocean gate module', () => {
  // Guards the duplicate/parallel-system rejection against the real tree: if a
  // second module ever claims the Ocean role, the gate must refuse to certify
  // and this test must fail.
  const root = path.resolve(__dirname, '..');
  const claimants = gate.discoverGateClaimants(root);
  assert.deepEqual(claimants, [gate.OCEAN_GATE_MODULE]);
  const decision = gate.evaluateOceanEligibility(facts({ siblingGateModules: claimants }));
  assert.equal(decision.ready, true, 'the real tree must currently be free of a parallel claimant');
});

test('a planted parallel gate is detected and blocks certification', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  try {
    const fake = path.join(dir, 'lib', 'ocean-integration-gate.js');
    fs.mkdirSync(path.join(dir, 'scripts'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'lib'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'lib', 'ocean-merge-eligibility.js'), '');
    fs.writeFileSync(fake, "'use strict';\n// OCEAN_PROTECTED_INTEGRATION\nconst READY_FOR_OCEAN = 'YES';\n");
    fs.writeFileSync(path.join(dir, 'scripts', 'unrelated.js'), 'module.exports = {};\n');
    const claimants = gate.discoverGateClaimants(dir);
    assert.deepEqual(claimants, ['lib/ocean-merge-eligibility.js', 'lib/ocean-integration-gate.js']);
    assert.ok(codes({ siblingGateModules: claimants }).includes('DUPLICATE_PARALLEL_SYSTEM'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
