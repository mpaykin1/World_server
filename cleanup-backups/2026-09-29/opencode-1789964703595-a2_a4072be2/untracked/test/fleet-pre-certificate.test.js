'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  detectVerdict,
  parseCertsFromText,
  normalizeSecondaryCert,
  evaluateFleetPreCertificate,
  DEFAULT_MAX_AGE_HOURS
} = require('../scripts/check-fleet-pre-certificate.cjs');

const HEAD = 'a4072be2e92e860073c668f323b602cf3f0c513e';
const NOW = Date.now();
const MAX_AGE = DEFAULT_MAX_AGE_HOURS * 3600 * 1000;
const FRESH = NOW - 1000;
const STALE = NOW - MAX_AGE - 1000;
const MARKER = `[FLEET][PRE_INTEGRATION_QA][PR_222][EXACT_HEAD_${HEAD}]`;

function freshCert(overrides) {
  return Object.assign(
    { pr: 222, headSha: HEAD, verdict: 'READY_FOR_OCEAN', source: 'issue#80', timestampMs: FRESH },
    overrides
  );
}

test('fleet-pre-certificate: happy path - exact fresh READY_FOR_OCEAN cert PASSES', () => {
  const result = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [freshCert()], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(result.state, 'PASS');
  assert.ok(result.reasons.includes('exact-fresh-cert'));
});

test('fleet-pre-certificate rule 1: no source / no certs BLOCKS', () => {
  const result = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(result.state, 'BLOCK');
  assert.ok(result.reasons.includes('no-source'));
});

test('fleet-pre-certificate rule 2: skipped/empty verdict BLOCKS for exact head', () => {
  const skipped = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [freshCert({ verdict: 'SKIPPED' })], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(skipped.state, 'BLOCK');
  assert.ok(skipped.reasons.includes('skipped'));
  const empty = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [freshCert({ verdict: 'EMPTY' })], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(empty.state, 'BLOCK');
  assert.ok(empty.reasons.includes('empty'));
});

test('fleet-pre-certificate rule 3: exactHeadSha != PR head BLOCKS', () => {
  const certForOtherHead = freshCert({ headSha: '0000000000000000000000000000000000000000' });
  const result = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [certForOtherHead], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(result.state, 'BLOCK');
  assert.ok(result.reasons.includes('head-sha-mismatch'));
});

test('fleet-pre-certificate rule 4: verdict != READY_FOR_OCEAN BLOCKS', () => {
  const result = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [freshCert({ verdict: 'RETURN_TO_BUILDER' })], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(result.state, 'BLOCK');
  assert.ok(result.reasons.includes('ambiguous'));
});

test('fleet-pre-certificate rule 5: stale cert older than max-age BLOCKS', () => {
  const result = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [freshCert({ timestampMs: STALE })], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(result.state, 'BLOCK');
  assert.ok(result.reasons.includes('stale'));
});

test('fleet-pre-certificate rule 6: ambiguous conflicting verdicts for exact head BLOCK', () => {
  const certs = [freshCert(), freshCert({ verdict: 'RETURN_TO_BUILDER' })];
  const result = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs, nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(result.state, 'BLOCK');
  assert.ok(result.reasons.includes('ambiguous'));
});

test('fleet-pre-certificate rule 7: source unavailable/ambiguous cannot PASS without cert', () => {
  const noIssuesNoData = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(noIssuesNoData.state, 'BLOCK');
  const onlySecondaryButEmpty = evaluateFleetPreCertificate({ headSha: HEAD, pr: 222, certs: [freshCert({ verdict: 'EMPTY', source: 'data/fleet-pre-certificates/' })], nowMs: NOW, maxAgeMs: MAX_AGE });
  assert.equal(onlySecondaryButEmpty.state, 'BLOCK');
});

test('fleet-pre-certificate: marker parse and secondary schema normalization are deterministic', () => {
  const parsed = parseCertsFromText(`Fleet PRE\n${MARKER}\nREADY_FOR_OCEAN=YES`, { source: 'issue#80', timestampMs: FRESH });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].pr, 222);
  assert.equal(parsed[0].headSha, HEAD);

  const normalized = normalizeSecondaryCert({
    schema: 'fleet-pre-certificate-v1',
    pr: 222,
    exactHeadSha: HEAD,
    verdict: 'READY_FOR_OCEAN',
    certifiedAt: new Date(FRESH).toISOString()
  });
  assert.equal(normalized.pr, 222);
  assert.equal(normalized.headSha, HEAD);
  assert.equal(normalized.verdict, 'READY_FOR_OCEAN');
  assert.equal(normalizeSecondaryCert({ schema: 'other', pr: 222 }), null);
  assert.equal(detectVerdict('READY_FOR_OCEAN=YES'), 'READY_FOR_OCEAN');
  assert.equal(detectVerdict('READY_FOR_OCEAN=SKIPPED'), 'SKIPPED');
  assert.equal(detectVerdict(''), 'EMPTY');
});

test('fleet-pre-merge-chain workflow cannot be green without the exact-SHA cert check', () => {
  const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'fleet-pre-merge-chain.yml');
  assert.ok(fs.existsSync(workflowPath), 'fleet-pre-merge-chain.yml must exist');
  const text = fs.readFileSync(workflowPath, 'utf8');
  assert.ok(text.includes('check-fleet-pre-certificate.cjs'), 'workflow must invoke the cert gate');
  assert.ok(text.includes('pull_request'), 'workflow must trigger on pull_request');
  assert.ok(text.includes('branches: [master]') || text.includes('master'), 'workflow must target master');
  assert.ok(!/check-fleet-pre-certificate\.cjs\s*\|\|\s*true/.test(text), 'gate must not be bypassed with || true');
  assert.ok(!/continue-on-error:\s*true/.test(text), 'gate must not use continue-on-error');
  assert.ok(!text.includes('fleet-pre-merge-chain-ok'), 'no fallback-green marker may exist');
  assert.ok(!/^\s*run:\s*echo/.test(text.split('check-fleet-pre-certificate.cjs')[1] || ''), 'no echo-only green fallback after the gate invocation');
});