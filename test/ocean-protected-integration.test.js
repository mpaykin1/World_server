'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/^\uFEFF/, '');
const readJson = (p) => JSON.parse(read(p));

const ocean = require('../lib/ocean-protected-integration');
const gate = require('../scripts/check-ocean-protected-integration');

const CANDIDATE_SHA = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678';
const DEFAULT_SHA = '00112233445566778899aabbccddeeff00112233';
const LKG_SHA = 'ffeeddccbbaa99887766554433221100fedcba98';

function readyCandidate(overrides = {}) {
  return {
    candidateSha: CANDIDATE_SHA,
    currentDefaultSha: DEFAULT_SHA,
    previousLkg: LKG_SHA,
    rollbackTarget: LKG_SHA,
    mergeConflictStatus: 'resolved',
    certificate: {
      kind: 'FLEET_PRE',
      sha: CANDIDATE_SHA,
      verdict: 'PASS',
      runId: '1234567890',
      status: 'completed',
    },
    ...overrides,
  };
}

function codes(result) {
  return result.rejections.map((r) => r.code);
}

// The Ocean predicate is the only authority that may declare a candidate integrable.
test('an exact-current-head Fleet PRE PASS candidate is the only READY_FOR_OCEAN case', () => {
  const result = ocean.evaluateOceanEligibility(readyCandidate(), { currentHeadSha: CANDIDATE_SHA });
  assert.equal(result.readyForOcean, true);
  assert.equal(result.verdict, 'READY_FOR_OCEAN');
  assert.deepEqual(result.rejections, []);
  assert.equal(ocean.oceanReadyLine(result), `READY_FOR_OCEAN=YES SHA=${CANDIDATE_SHA}`);
});

test('the Ocean gate is fail-closed: an empty candidate rejects with every missing invariant', () => {
  const result = ocean.evaluateOceanEligibility({});
  assert.equal(result.readyForOcean, false);
  assert.equal(result.verdict, 'REJECTED');
  assert.deepEqual(codes(result).sort(), [
    'MISSING_CANDIDATE_SHA',
    'MISSING_CURRENT_DEFAULT_SHA',
    'MISSING_FLEET_PRE_CERTIFICATE',
    'MISSING_ROLLBACK_LKG',
    'UNRESOLVED_MERGE_CONFLICT',
  ].sort());
  assert.match(ocean.oceanReadyLine(result), /^READY_FOR_OCEAN=NO rejections=.+/);
});

test('Ocean never self-certifies: a candidate without an independent certificate is rejected', () => {
  const candidate = readyCandidate();
  delete candidate.certificate;
  assert.ok(codes(ocean.evaluateOceanEligibility(candidate)).includes('MISSING_FLEET_PRE_CERTIFICATE'));
});

test('a certificate for any other exact SHA is stale and rejected', () => {
  const result = ocean.evaluateOceanEligibility(
    readyCandidate({ certificate: { ...readyCandidate().certificate, sha: 'b'.repeat(40) } }),
    { currentHeadSha: CANDIDATE_SHA },
  );
  assert.equal(result.readyForOcean, false);
  assert.deepEqual(codes(result), ['STALE_CERTIFICATE']);
});

test('a stale certificate cannot be masked by recasing or by a shortened SHA', () => {
  const short = ocean.evaluateOceanEligibility(
    readyCandidate({ certificate: { ...readyCandidate().certificate, sha: CANDIDATE_SHA.slice(0, 7) } }),
  );
  assert.ok(codes(short).includes('STALE_CERTIFICATE'));

  const recasedSameRevision = ocean.evaluateOceanEligibility(
    readyCandidate({ candidateSha: CANDIDATE_SHA.toUpperCase(), certificate: { ...readyCandidate().certificate } }),
  );
  assert.equal(recasedSameRevision.readyForOcean, true);

  const recasedDifferentRevision = ocean.evaluateOceanEligibility(
    readyCandidate({ certificate: { ...readyCandidate().certificate, sha: 'B'.repeat(40) } }),
  );
  assert.ok(codes(recasedDifferentRevision).includes('STALE_CERTIFICATE'));
});

test('a non-FLEET_PRE or non-PASS certificate is rejected by kind and verdict', () => {
  const base = readyCandidate().certificate;
  const wrongKind = ocean.evaluateOceanEligibility(readyCandidate({ certificate: { ...base, kind: 'BUILDER_SELF_REVIEW' } }));
  assert.ok(codes(wrongKind).includes('CERTIFICATE_KIND_MISMATCH'));

  const wrongVerdict = ocean.evaluateOceanEligibility(readyCandidate({ certificate: { ...base, verdict: 'PENDING' } }));
  assert.ok(codes(wrongVerdict).includes('CERTIFICATE_VERDICT_NOT_PASS'));
});

test('an incomplete or in-flight Fleet PRE run cannot certify Ocean eligibility', () => {
  const base = readyCandidate().certificate;

  const noRun = ocean.evaluateOceanEligibility(readyCandidate({ certificate: { ...base, runId: '' } }));
  assert.ok(codes(noRun).includes('CERTIFICATE_NOT_COMPLETED'));

  const running = ocean.evaluateOceanEligibility(readyCandidate({ certificate: { ...base, status: 'in_progress' } }));
  assert.ok(codes(running).includes('CERTIFICATE_NOT_COMPLETED'));
});

test('a candidate that is not the exact observed current head is rejected', () => {
  const result = ocean.evaluateOceanEligibility(readyCandidate(), { currentHeadSha: 'b'.repeat(40) });
  assert.equal(result.readyForOcean, false);
  assert.deepEqual(codes(result), ['CANDIDATE_NOT_CURRENT_HEAD']);
});

test('an unresolved, unknown or dirty merge state blocks integration', () => {
  for (const status of ['unresolved', 'conflicted', 'unknown', 'dirty', '', null, undefined]) {
    const result = ocean.evaluateOceanEligibility(readyCandidate({ mergeConflictStatus: status }));
    assert.equal(result.readyForOcean, false, `mergeConflictStatus=${JSON.stringify(status)}`);
    assert.ok(codes(result).includes('UNRESOLVED_MERGE_CONFLICT'));
  }
  assert.equal(ocean.evaluateOceanEligibility(readyCandidate({ mergeConflictStatus: 'RESOLVED' })).readyForOcean, true);
});

test('integration without a reachable rollback is rejected', () => {
  const noLkg = ocean.evaluateOceanEligibility(readyCandidate({ previousLkg: '' }));
  assert.ok(codes(noLkg).includes('MISSING_ROLLBACK_LKG'));

  const noRollback = ocean.evaluateOceanEligibility(readyCandidate({ rollbackTarget: '' }));
  assert.ok(codes(noRollback).includes('MISSING_ROLLBACK_LKG'));

  const selfRollback = ocean.evaluateOceanEligibility(readyCandidate({ rollbackTarget: CANDIDATE_SHA }));
  assert.ok(codes(selfRollback).includes('ROLLBACK_EQUALS_CANDIDATE'));
});

test('a parallel or duplicate Ocean implementation is rejected even if it claims to be a superset', () => {
  const result = ocean.evaluateOceanEligibility(readyCandidate({
    systems: [{ id: 'ocean-integration-v2', paths: ['lib/ocean-protected-integration.js'], supersets: 'ocean-protected-integration' }],
  }));
  assert.equal(result.readyForOcean, false);
  assert.ok(codes(result).includes('DUPLICATE_PARALLEL_SYSTEM'));

  const unrelated = ocean.evaluateOceanEligibility(readyCandidate({
    systems: [{ id: 'some-other-system', paths: ['apps/voxel-world/client.js'] }],
  }));
  assert.equal(unrelated.readyForOcean, true);

  const ownId = ocean.evaluateOceanEligibility(readyCandidate({
    systems: [{ id: 'ocean-protected-integration', paths: ['lib/ocean-protected-integration.js'] }],
  }));
  assert.equal(ownId.readyForOcean, true);
});

test('duplicate detection matches nested paths but not unrelated siblings', () => {
  assert.equal(ocean.matchesCanonicalPath('lib/ocean-protected-integration.js', 'lib/ocean-protected-integration.js'), true);
  assert.equal(ocean.matchesCanonicalPath('./lib/ocean-protected-integration.js', 'lib/ocean-protected-integration.js'), true);
  assert.equal(ocean.matchesCanonicalPath('lib/ocean-protected-integration.js/more', 'lib/ocean-protected-integration.js'), true);
  assert.equal(ocean.matchesCanonicalPath('lib/ocean-protected-integration.jsx', 'lib/ocean-protected-integration.js'), false);
  assert.equal(ocean.matchesCanonicalPath('scripts/check-ocean-protected-integration.js', 'scripts/check-ocean-protected-integration.js'), true);
});

test('rejections are reported in a stable declared order and never short-circuit', () => {
  const broken = { mergeConflictStatus: 'conflicted' };
  const first = ocean.evaluateOceanEligibility(broken);
  const second = ocean.evaluateOceanEligibility(broken);
  assert.deepEqual(codes(first), codes(second));
  assert.deepEqual(codes(first), codes(first).slice().sort((a, b) => ocean.REJECTION_CODES.indexOf(a) - ocean.REJECTION_CODES.indexOf(b)));
  assert.ok(codes(first).length >= 5);
});

test('a non-object or absent candidate is rejected instead of throwing', () => {
  for (const value of [undefined, null, 'sha', 42, []]) {
    const result = ocean.evaluateOceanEligibility(value);
    assert.equal(result.readyForOcean, false);
  }
});

test('the Ocean -> Fleet POST handoff carries exact candidate, integrated, LKG, rollback and POST scenarios', () => {
  const handoff = ocean.buildOceanHandoff({
    candidate: readyCandidate(),
    integratedSha: 'c'.repeat(40),
    deploymentUrl: 'https://example.invalid/',
    postScenarios: [{ name: 'exact-revision', request: 'GET /api/config', expect: 'revision header equals integrated sha' }],
  });
  assert.equal(handoff.candidateSha, CANDIDATE_SHA);
  assert.equal(handoff.integratedSha, 'c'.repeat(40));
  assert.equal(handoff.defaultSha, 'c'.repeat(40));
  assert.equal(handoff.previousLkg, LKG_SHA);
  assert.equal(handoff.rollback, LKG_SHA);
  assert.equal(handoff.deploymentIdentity.provider, 'cloudflare');
  assert.equal(handoff.selfCertified, false);
  assert.equal(ocean.validateOceanHandoff(handoff).ok, true);
});

test('an incomplete handoff or one that self-certifies live is rejected', () => {
  const base = ocean.buildOceanHandoff({
    candidate: readyCandidate(),
    integratedSha: 'c'.repeat(40),
    deploymentUrl: 'https://example.invalid/',
    postScenarios: [{ name: 'exact-revision', request: 'GET /api/config', expect: 'revision match' }],
  });

  for (const field of ocean.policy.handoff.requiredFields) {
    const broken = { ...base, [field]: '' };
    const report = ocean.validateOceanHandoff(broken);
    assert.equal(report.ok, false, `field ${field}`);
    assert.ok(report.missing.includes(field));
  }

  const emptyScenarios = ocean.validateOceanHandoff({ ...base, postScenarios: [] });
  assert.equal(emptyScenarios.ok, false);
  assert.ok(emptyScenarios.missing.includes('postScenarios'));

  const vagueScenario = ocean.validateOceanHandoff({ ...base, postScenarios: [{ name: 'x' }] });
  assert.equal(vagueScenario.ok, false);
  assert.ok(vagueScenario.invalid.some((p) => p.startsWith('postScenarios[0].request')));
  assert.ok(vagueScenario.invalid.some((p) => p.startsWith('postScenarios[0].expect')));

  const selfCertified = ocean.validateOceanHandoff({ ...base, selfCertified: true });
  assert.equal(selfCertified.ok, false);
  assert.ok(selfCertified.invalid.some((p) => p.includes('selfCertified')));
});

test('policy self-check holds and the protective flags cannot be weakened', () => {
  assert.deepEqual(ocean.policySelfCheck(), { ok: true, problems: [] });
  assert.equal(ocean.policy.failClosed, true);
  assert.equal(ocean.policy.authority.selfCertificationForbidden, true);
  assert.equal(ocean.policy.authority.productionDeploymentForbidden, true);
  assert.equal(ocean.policy.authority.integratesOnlyExactCurrentHeadFleetPreCandidate, true);
});

test('the hard gate exits non-zero unless the predicate passes, with no weakenable escape', () => {
  const source = read('scripts/check-ocean-protected-integration.js');
  assert.equal(source.includes('|| true'), false);
  assert.equal(source.includes('continue-on-error'), false);
  assert.ok(source.includes('process.exit(1)'));
  assert.ok(source.includes('Ocean protected integration gate error'));

  const workflow = read('.github/workflows/fleet-pre-exact-sha.yml');
  assert.equal(workflow.includes('continue-on-error'), false);
  assert.equal(workflow.includes('|| true'), false);
});

test('the CI gate verifies policy invariants and the canonical Ocean files exist', () => {
  const report = gate.runPolicyCheck();
  assert.equal(report.ok, true);
  assert.deepEqual(report.problems, []);
  assert.deepEqual(report.missingCanonicalPaths, []);
  assert.equal(gate.run(['--policy-check']), 0);
});

test('the CLI rejects an incomplete candidate payload with exit code 1 and READY_FOR_OCEAN=NO', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  try {
    const payloadPath = path.join(dir, 'candidate.json');
    fs.writeFileSync(payloadPath, JSON.stringify({ candidateSha: CANDIDATE_SHA }), 'utf8');
    const argv = ['--candidate', payloadPath, '--json'];
    assert.equal(gate.parseArgs(argv).mode, 'candidate');
    assert.equal(gate.run(argv), 1);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the CLI accepts a valid candidate payload with exit code 0', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-gate-'));
  try {
    const payloadPath = path.join(dir, 'candidate.json');
    fs.writeFileSync(payloadPath, JSON.stringify(readyCandidate()), 'utf8');
    assert.equal(gate.run(['--candidate', payloadPath, `--current-head=${CANDIDATE_SHA}`, '--json']), 0);
    assert.equal(gate.run(['--handoff', writeHandoff(dir), '--json']), 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  function writeHandoff(baseDir) {
    const handoffPath = path.join(baseDir, 'handoff.json');
    const handoff = ocean.buildOceanHandoff({
      candidate: readyCandidate(),
      integratedSha: 'c'.repeat(40),
      deploymentUrl: 'https://example.invalid/',
      postScenarios: [{ name: 'exact-revision', request: 'GET /api/config', expect: 'revision match' }],
    });
    fs.writeFileSync(handoffPath, JSON.stringify(handoff), 'utf8');
    return handoffPath;
  }
});

test('the Ocean contract is discoverable from the canonical control document', () => {
  const control = read('CHATGPT_GAME_CONTROL.md');
  assert.ok(control.includes('Builder -> Fleet PRE -> Ocean -> Fleet POST'));
  const policy = readJson('data/ocean-protected-integration-policy.json');
  assert.equal(policy.handoff.consumer, 'fleet-post');
  assert.ok(policy.handoff.requiredFields.includes('previousLkg'));
  assert.ok(policy.handoff.requiredFields.includes('rollback'));
  assert.ok(policy.handoff.requiredFields.includes('postScenarios'));
});