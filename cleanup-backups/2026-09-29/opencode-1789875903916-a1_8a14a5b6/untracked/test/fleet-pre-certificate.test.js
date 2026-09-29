'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const {
  DEFAULT_MAX_AGE_HOURS,
  ACCEPTED_VERDICT,
  normalizeHead,
  parseCertMarkers,
  evaluateCertificates,
  parseArgs
} = require('../scripts/check-fleet-pre-certificate.cjs');

const HEAD = '8a14a5b67230703097ea2fc9f2b0868a457c986b';
const OTHER_HEAD = 'd06cb3ed737718576f2cd933a6df31b7748bbf4c';
const PR = 118;
const NOW = Date.parse('2026-09-20T02:00:00Z');

function freshCert(overrides) {
  return {
    pr: PR,
    exactHeadSha: HEAD,
    verdict: ACCEPTED_VERDICT,
    createdAtMs: NOW - 60 * 60 * 1000, // 1h old, inside 24h window
    source: 'issue-80:comment-1',
    ...overrides
  };
}

function verdictFor(opts) {
  return evaluateCertificates({ expectedHeadSha: HEAD, expectedPr: PR, maxAgeHours: DEFAULT_MAX_AGE_HOURS, nowMs: NOW, certs: opts.certs });
}

test('FAIL-CLOSED 1: absent/no source blocks', () => {
  const r = verdictFor({ certs: [] });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'no-source');
});

test('FAIL-CLOSED 2: skipped/empty cert blocks', () => {
  const r = verdictFor({ certs: [freshCert({ verdict: 'SKIPPED' })] });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'skipped-empty');
});

test('FAIL-CLOSED 3: head SHA mismatch to PR head blocks', () => {
  const r = verdictFor({ certs: [freshCert({ exactHeadSha: OTHER_HEAD })] });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'head-mismatch');
});

test('FAIL-CLOSED 4: verdict other than READY_FOR_OCEAN blocks', () => {
  const r = verdictFor({ certs: [freshCert({ verdict: 'NOT_NO' })] });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'verdict-mismatch');
});

test('FAIL-CLOSED 5: stale cert older than max age blocks', () => {
  const stale = NOW - (DEFAULT_MAX_AGE_HOURS + 1) * 3600 * 1000;
  const r = verdictFor({ certs: [freshCert({ createdAtMs: stale })] });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'stale');
});

test('FAIL-CLOSED 6: ambiguous multiple sources block', () => {
  const r = verdictFor({
    certs: [freshCert({ source: 'issue-80:comment-1' }), freshCert({ source: 'checked-in' })]
  });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'ambiguous');
});

test('FAIL-CLOSED 7: missing/unusable timestamp blocks', () => {
  const r = verdictFor({ certs: [freshCert({ createdAtMs: 0 })] });
  assert.equal(r.pass, false);
  assert.equal(r.block, 'no-timestamp');
});

test('HAPPY PATH: exact fresh READY_FOR_OCEAN cert passes', () => {
  const r = verdictFor({ certs: [freshCert()] });
  assert.equal(r.pass, true);
  assert.equal(r.code, 'PASS');
  assert.equal(r.block, '');
});

test('default max age is 24 hours', () => {
  assert.equal(DEFAULT_MAX_AGE_HOURS, 24);
});

test('parseCertMarkers extracts exact-SHA marker with READY_FOR_OCEAN=YES', () => {
  const body = `[FLEET][PRE_INTEGRATION_QA][PR_${PR}][EXACT_HEAD_${HEAD}]\n${ACCEPTED_VERDICT}=YES sample evidence`;
  const markers = parseCertMarkers(body);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].pr, PR);
  assert.equal(markers[0].exactHeadSha, HEAD);
  assert.equal(markers[0].verdict, ACCEPTED_VERDICT);
});

test('parseCertMarkers treats marker without verdict as skipped', () => {
  const body = `[FLEET][PRE_INTEGRATION_QA][PR_${PR}][EXACT_HEAD_${HEAD}] no verdict here`;
  const markers = parseCertMarkers(body);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].verdict, 'SKIPPED');
});

test('normalizeHead lowercases and trims', () => {
  assert.equal(normalizeHead(` ${HEAD.toUpperCase()} `), HEAD);
});

test('parseArgs accepts positional head and key=value options', () => {
  const a = parseArgs(['node', 'script.cjs', HEAD, '--pr=118', '--max-age-hours=12', '--source=gh']);
  assert.equal(a.head, HEAD);
  assert.equal(a.pr, 118);
  assert.equal(a.maxAgeHours, 12);
  assert.equal(a.source, 'gh');
});

test('BYPASS-CLASS SCAN: workflow cannot be green without the exact-SHA cert check', () => {
  const wf = fs.readFileSync(path.join(__dirname, '../.github/workflows/fleet-pre-merge-chain.yml'), 'utf8');
  // The canonical check that must gate the merge chain.
  assert.ok(wf.includes('check-fleet-pre-certificate.cjs'), 'workflow must invoke the cert checker');
  assert.ok(wf.includes('pull_request.head.sha'), 'workflow must certify the exact PR head SHA');
  // No bypass of any kind may exist.
  assert.ok(!/\|\|\s*true/.test(wf), 'no `|| true` bypass');
  assert.ok(!wf.includes('continue-on-error'), 'no continue-on-error');
  assert.ok(!/exit\s+0\s*#?.*(always|fallback)/.test(wf), 'no unconditional fallback success');
  assert.ok(!wf.includes('if: always()'), 'no unconditional-green step');
  assert.ok(wf.includes('set -euo pipefail'), 'shell must fail closed');
  assert.ok(wf.includes('BLOCK'), 'no silent block swallowing');
});

test('fixture cert for the exact default HEAD validates when fresh', () => {
  // Sanity: the script reports PASS only for a deterministic fresh cert.
  const r = evaluateCertificates({
    expectedHeadSha: HEAD,
    expectedPr: PR,
    maxAgeHours: 24,
    nowMs: NOW,
    certs: [freshCert()]
  });
  assert.equal(r.pass, true);
});