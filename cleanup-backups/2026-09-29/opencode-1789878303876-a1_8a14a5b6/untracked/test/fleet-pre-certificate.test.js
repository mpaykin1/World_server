'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  cleanHeadSha,
  parseCertMarkers,
  extractVerdict,
  parseIssueComments,
  parseDataCerts,
  evaluate,
  VERDICT_READY,
  VERDICT_RETURN,
  VERDICT_BLOCKED,
  VERDICT_UNKNOWN,
  DEFAULT_MAX_AGE_MS
} = require('../scripts/check-fleet-pre-certificate.cjs');

const root = path.resolve(__dirname, '..');
const workflow = fs.readFileSync(path.join(root, '.github', 'workflows', 'fleet-pre-merge-chain.yml'), 'utf8');
const gateScript = fs.readFileSync(path.join(root, 'scripts', 'check-fleet-pre-certificate.cjs'), 'utf8');

const NOW = Date.UTC(2026, 8, 20, 12, 0, 0);
const HEAD = 'a'.repeat(40);
const nowIso = () => new Date(NOW).toISOString();
const freshIso = () => new Date(NOW - 1000).toISOString();
const staleIso = () => new Date(NOW - (DEFAULT_MAX_AGE_MS + 1000)).toISOString();

function cert(overrides = {}) {
  return {
    pr: 188,
    exactHeadSha: HEAD,
    verdict: VERDICT_READY,
    verifiedAt: freshIso(),
    source: 'issue80',
    ...overrides
  };
}

test('cleanHeadSha accepts only exact 40-char lowercase Git SHAs', () => {
  assert.equal(cleanHeadSha(HEAD), HEAD);
  assert.equal(cleanHeadSha(HEAD.toUpperCase()), HEAD);
  assert.equal(cleanHeadSha('short'), null);
  assert.equal(cleanHeadSha('z'.repeat(40)), null);
  assert.equal(cleanHeadSha(undefined), null);
});

test('fail-closed 1/7: absent/no-source blocks (BLOCKED_NO_SOURCE)', () => {
  const result = evaluate([], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BLOCKED_NO_SOURCE');
});

test('fail-closed 2/7: source unavailable (no issue comments) blocks (BLOCKED_SOURCE_UNAVAILABLE)', () => {
  const result = evaluate([], [cert({ source: 'data/fleet-pre-certificates/PR_188.json' })], {
    pr: 188,
    headSha: HEAD,
    now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BLOCKED_SOURCE_UNAVAILABLE');
});

test('fail-closed 3/7: exactHeadSha != PR head blocks (BLOCKED_SHA_MISMATCH)', () => {
  const result = evaluate([cert({ exactHeadSha: 'b'.repeat(40) })], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BLOCKED_SHA_MISMATCH');
});

test('fail-closed 4/7: no exact cert for this PR head blocks (BLOCKED_NO_EXACT_CERT)', () => {
  const result = evaluate([cert({ pr: 999 })], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BLOCKED_NO_EXACT_CERT');
});

test('fail-closed 5/7: skipped/empty verdict blocks (BLOCKED_SKIPPED_EMPTY)', () => {
  const skipped = evaluate([cert({ verdict: VERDICT_UNKNOWN })], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(skipped.ok, false);
  assert.equal(skipped.reason, 'BLOCKED_SKIPPED_EMPTY');
  const missingTimestamp = evaluate([cert({ verifiedAt: null })], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(missingTimestamp.ok, false);
  assert.equal(missingTimestamp.reason, 'BLOCKED_SKIPPED_EMPTY');
});

test('fail-closed 6/7: verdict != READY_FOR_OCEAN blocks (BLOCKED_VERDICT)', () => {
  for (const verdict of [VERDICT_RETURN, VERDICT_BLOCKED]) {
    const result = evaluate([cert({ verdict })], [], { pr: 188, headSha: HEAD, now: NOW });
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'BLOCKED_VERDICT');
  }
});

test('fail-closed 7/7: stale cert (>max-age) blocks even with READY verdict (BLOCKED_STALE)', () => {
  const result = evaluate([cert({ verifiedAt: staleIso() })], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'BLOCKED_STALE');
});

test('ambiguous conflicting certs for the exact head block (BLOCKED_AMBIGUOUS)', () => {
  const conflictingData = evaluate(
    [cert()],
    [cert({ source: 'data/fleet-pre-certificates/PR_188.json', verdict: VERDICT_RETURN })],
    { pr: 188, headSha: HEAD, now: NOW }
  );
  assert.equal(conflictingData.ok, false);
  assert.equal(conflictingData.reason, 'BLOCKED_AMBIGUOUS');
  const mixedPrimary = evaluate(
    [cert(), cert({ verdict: VERDICT_RETURN, verifiedAt: freshIso() })],
    [],
    { pr: 188, headSha: HEAD, now: NOW }
  );
  assert.equal(mixedPrimary.ok, false);
  assert.equal(mixedPrimary.reason, 'BLOCKED_AMBIGUOUS');
});

test('happy path: exact fresh READY_FOR_OCEAN cert passes', () => {
  const result = evaluate([cert()], [], { pr: 188, headSha: HEAD, now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.verdict, VERDICT_READY);
  assert.equal(result.cert.exactHeadSha, HEAD);
  assert.equal(result.cert.pr, 188);
});

test('parseIssueComments parses the authoritative issue #80 marker format', () => {
  const comment = `[FLEET][PRE_INTEGRATION_QA][PR_188][EXACT_HEAD_${HEAD}]
READY_FOR_OCEAN=YES
VERDICT=READY_FOR_OCEAN`;
  const certs = parseIssueComments([{ created_at: nowIso(), body: comment }]);
  assert.equal(certs.length, 1);
  assert.equal(certs[0].pr, 188);
  assert.equal(certs[0].exactHeadSha, HEAD);
  assert.equal(certs[0].verdict, VERDICT_READY);
});

test('parseCertMarkers extracts PR and exact HEAD from the canonical marker', () => {
  const markers = parseCertMarkers(`[FLEET][PRE_INTEGRATION_QA][PR_188][EXACT_HEAD_${HEAD}]`);
  assert.deepEqual(markers, [{ pr: 188, exactHeadSha: HEAD }]);
  assert.equal(parseCertMarkers('no marker here').length, 0);
});

test('extractVerdict is fail-closed and deterministic', () => {
  assert.equal(extractVerdict('READY_FOR_OCEAN=YES'), VERDICT_READY);
  assert.equal(extractVerdict('READY_FOR_OCEAN=NO'), VERDICT_RETURN);
  assert.equal(extractVerdict('RETURN_TO_BUILDER'), VERDICT_RETURN);
  assert.equal(extractVerdict('VERDICT=BLOCKED'), VERDICT_BLOCKED);
  assert.equal(extractVerdict('nothing here'), VERDICT_UNKNOWN);
});

test('bypass-class scan: the workflow CANNOT be green without the exact-SHA cert gate', () => {
  assert.match(workflow, /name:\s*Fleet-PRE Merge Chain Gate/);
  assert.match(workflow, /on:\s*\n\s*pull_request:\s*\n\s*branches:\s*\[master\]/);
  assert.doesNotMatch(workflow, /\|\|\s*true/);
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);
  assert.doesNotMatch(workflow, /if:\s*always\(\)/);
  assert.doesNotMatch(workflow, /\|\|\s*exit\s+0/);
  const gateStep = /scripts\/check-fleet-pre-certificate\.cjs/g.exec(workflow);
  assert.ok(gateStep, 'workflow must invoke the Fleet PRE cert gate');
  assert.match(workflow, /--pr="\$PR_NUMBER"/);
  assert.match(workflow, /--head-sha="\$HEAD_SHA"/);
  assert.match(workflow, /gh api "repos\/\$\{REPO\}\/issues\/80\/comments"/);
  assert.match(workflow, /set -euo pipefail/);
  assert.ok(workflow.split('\n').filter(l => l.includes('check-fleet-pre-certificate.cjs')).length >= 1);
});

test('bypass-class scan: the gate script itself fails closed with no escape hatch', () => {
  assert.match(gateScript, /function block/);
  assert.match(gateScript, /BLOCKED_NO_SOURCE/);
  assert.match(gateScript, /BLOCKED_STALE/);
  assert.doesNotMatch(gateScript, /\|\|\s*true/);
  assert.doesNotMatch(gateScript, /catch\s*\(\s*\)\s*\{\s*return\s+\{ ok: true/m);
  assert.match(gateScript, /module\.exports/);
});

test('parseDataCerts rejects malformed secondary records deterministically', () => {
  const parsed = parseDataCerts([null, { pr: '188', exactHeadSha: HEAD, verdict: VERDICT_READY }], 'data/fleet-pre-certificates/PR_188.json');
  assert.equal(parsed.ok, true);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.records[0].pr, 188);
  const empty = parseDataCerts('not-an-array', 'x');
  assert.equal(empty.ok, false);
});