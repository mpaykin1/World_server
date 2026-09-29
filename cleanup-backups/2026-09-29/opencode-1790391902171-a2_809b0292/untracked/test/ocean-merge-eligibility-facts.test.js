'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const { buildFacts, extractVerdict, selectReviewRun } = require('../scripts/ocean-merge-eligibility-facts.js');
const { evaluateOceanEligibility, INDEPENDENT_REVIEW_CHECK } = require('../lib/ocean-merge-eligibility.js');

const factsScript = path.join(__dirname, '../scripts/ocean-merge-eligibility-facts.js');
const gateScript = path.join(__dirname, '../scripts/ocean-merge-eligibility-gate.js');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/fleet-pre-exact-sha.yml'), 'utf8');

const HEAD = 'a'.repeat(40);
const MASTER = 'b'.repeat(40);

function checkRun(overrides = {}) {
  return {
    name: INDEPENDENT_REVIEW_CHECK,
    head_sha: HEAD,
    status: 'completed',
    conclusion: 'success',
    output: { title: 'Independent review: PASS' },
    ...overrides
  };
}

// Shapes are the real API payload keys of repos/{owner}/{repo}/pulls/{number},
// git/ref/heads/master and commits/{sha}/check-runs.
function prPayload(overrides = {}) {
  return {
    number: 900,
    base: { ref: 'master', sha: MASTER },
    head: { sha: HEAD },
    draft: false,
    mergeable: true,
    mergeable_state: 'clean',
    ...overrides
  };
}

function masterPayload(sha = MASTER) {
  return { object: { sha } };
}

function baseInput(overrides = {}) {
  return {
    expected: HEAD,
    certifiedSha: HEAD,
    checkName: INDEPENDENT_REVIEW_CHECK,
    prNumber: 900,
    pr: prPayload(),
    master: masterPayload(),
    checks: { check_runs: [checkRun()] },
    ...overrides
  };
}

test('a real PASS review title is recognised, not treated as unparsable', () => {
  // REGRESSION: the published title is `Independent review: <VERDICT>`, not
  // `verdict: <VERDICT>`. A title regex that only matched the latter produced
  // verdict:null and would then reject every genuinely passing candidate.
  assert.equal(extractVerdict(checkRun()), 'PASS');
  assert.equal(
    extractVerdict(checkRun({ output: { title: 'Independent review: INCONCLUSIVE' } })),
    'INCONCLUSIVE'
  );
  assert.equal(extractVerdict(checkRun({ output: { title: 'Independent review: BLOCK' } })), 'BLOCK');
  assert.equal(extractVerdict(checkRun({ output: { title: 'verdict: PASS' } })), 'PASS');
  assert.equal(extractVerdict(checkRun({ output: {} })), null);
  assert.equal(extractVerdict({}), null);
  assert.equal(extractVerdict(null), null);
});

test('REGRESSION: a clean, current, independently PASS candidate is certified', () => {
  // Guards the false-negative direction: fail-closed must not become fail-always.
  const facts = buildFacts(baseInput());
  assert.equal(facts.review.found, true);
  assert.equal(facts.review.verdict, 'PASS');
  const verdict = evaluateOceanEligibility(facts);
  assert.deepEqual(verdict.blockers, []);
  assert.equal(verdict.ready, true);
});

test('the exact-head review run is selected, never another check name', () => {
  const checks = {
    check_runs: [
      checkRun({ name: 'CI' }),
      checkRun({ name: 'World Independent Adversarial Review', conclusion: 'failure', output: { title: 'Independent review: BLOCK' } }),
      checkRun({ name: 'CI', conclusion: 'success' })
    ]
  };
  assert.equal(selectReviewRun(checks, INDEPENDENT_REVIEW_CHECK).conclusion, 'failure');
  assert.equal(selectReviewRun({ check_runs: [] }, INDEPENDENT_REVIEW_CHECK), null);
  assert.equal(selectReviewRun({}, INDEPENDENT_REVIEW_CHECK), null);
  assert.equal(selectReviewRun(null, INDEPENDENT_REVIEW_CHECK), null);
});

test('unusable API payloads still produce facts that block with a reason', () => {
  for (const broken of [null, {}, 'garbage', 42]) {
    const facts = buildFacts(baseInput({ pr: broken, master: broken, checks: broken }));
    const verdict = evaluateOceanEligibility(facts);
    assert.equal(verdict.ready, false, `pr=${JSON.stringify(broken)} must not certify`);
    assert.ok(verdict.blockers.length > 0);
  }
});

test('an untrusted or malformed master ref never becomes a trusted base', () => {
  assert.equal(buildFacts(baseInput({ master: { object: { sha: 'nope' } } })).trustedMasterSha, null);
  assert.equal(buildFacts(baseInput({ master: { ref: 'heads/master' } })).trustedMasterSha, null);
  assert.equal(buildFacts(baseInput({ master: null })).trustedMasterSha, null);
  assert.equal(buildFacts(baseInput({ master: masterPayload() })).trustedMasterSha, MASTER);
});

test('REGRESSION: the live PR #278 payloads block end to end through the CLI', () => {
  // Real payload values read from GitHub for PR #278 exact head
  // 3447609653618a7ee910542be1fb70ec3e8db13b against master 809b0292.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocean-facts-'));
  try {
    fs.writeFileSync(
      path.join(dir, 'pr.json'),
      JSON.stringify({
        number: 278,
        base: { ref: 'master', sha: 'a1ebfffff228727186136f75745b6d5ed60ba817' },
        head: { sha: '3447609653618a7ee910542be1fb70ec3e8db13b' },
        draft: false,
        mergeable: true,
        mergeable_state: 'behind'
      })
    );
    fs.writeFileSync(path.join(dir, 'master.json'), JSON.stringify(masterPayload('809b0292b26edb1ea320e61144f1b1dfed772922')));
    fs.writeFileSync(
      path.join(dir, 'checks.json'),
      JSON.stringify({
        check_runs: [
          checkRun({
            head_sha: '3447609653618a7ee910542be1fb70ec3e8db13b',
            conclusion: 'action_required',
            output: { title: 'Independent review: INCONCLUSIVE' }
          })
        ]
      })
    );

    const shape = spawnSync(process.execPath, [factsScript, dir], {
      encoding: 'utf8',
      env: {
        ...process.env,
        EXPECTED: '3447609653618a7ee910542be1fb70ec3e8db13b',
        CERTIFIED_SHA: '3447609653618a7ee910542be1fb70ec3e8db13b',
        PR_NUMBER: '278',
        CHECK_NAME: INDEPENDENT_REVIEW_CHECK
      }
    });
    assert.equal(shape.status, 0, shape.stderr);

    const gate = spawnSync(process.execPath, [gateScript, path.join(dir, 'facts.json')], { encoding: 'utf8' });
    assert.equal(gate.status, 1, 'a reviewed-behind, inconclusive candidate must not be Ocean ready');
    assert.doesNotMatch(gate.stdout, /READY_FOR_OCEAN/);
    assert.match(gate.stderr, /INDEPENDENT_REVIEW_INCONCLUSIVE/);
    assert.match(gate.stderr, /BASE_NOT_CURRENT_MASTER/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the workflow shapes facts with the same tested script it certifies against', () => {
  assert.match(workflow, /node scripts\/ocean-merge-eligibility-facts\.js "\$RUNNER_TEMP\/ocean"/);
  assert.match(workflow, /node scripts\/ocean-merge-eligibility-gate\.js "\$RUNNER_TEMP\/ocean\/facts\.json"/);
  // The shaping must not be re-implemented as an inline jq program, which
  // would bypass the unit tests above.
  assert.doesNotMatch(workflow, /jq -n/);
});
