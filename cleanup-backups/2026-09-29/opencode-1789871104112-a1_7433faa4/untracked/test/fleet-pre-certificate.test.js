'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  SCHEMA,
  DEFAULT_MAX_AGE_HOURS,
  MARKER_RE,
  isValidHeadSha,
  parseFleetCertComment,
  parseIssueComments,
  loadDataCerts,
  validateFleetPreCertificate,
} = require('../scripts/check-fleet-pre-certificate.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const HEAD = 'a'.repeat(40);
const NOW = Date.UTC(2026, 8, 20, 12, 0, 0); // 2026-09-20T12:00:00Z
const FRESH = new Date(NOW - 1000).toISOString();
const FRESH_COMMENT = [
  `[FLEET][PRE_INTEGRATION_QA][PR_187][EXACT_HEAD_${HEAD}]`,
  'READY_FOR_OCEAN=YES',
].join('\n');

function freshCert(over = {}) {
  return {
    pr: 187,
    exactHeadSha: HEAD,
    verdict: 'READY_FOR_OCEAN',
    createdAt: FRESH,
    source: 'test',
    ...over,
  };
}

test('7 fail-closed rules and happy path', () => {
  // Rule 1: no certificate source at all.
  assert.equal(validateFleetPreCertificate([], { headSha: HEAD, now: NOW }).rule, 'no-certificate-source');

  // Rule 3: exact head mismatch.
  assert.equal(
    validateFleetPreCertificate([freshCert({ exactHeadSha: 'b'.repeat(40) })], { headSha: HEAD, now: NOW }).rule,
    'exact-head-mismatch'
  );

  // Rule 2: skipped / empty certificates never pass.
  assert.equal(
    validateFleetPreCertificate([freshCert({ skipped: true })], { headSha: HEAD, now: NOW }).rule,
    'certificate-empty-or-skipped'
  );
  assert.equal(
    validateFleetPreCertificate([freshCert({ verdict: 'UNSPECIFIED' })], { headSha: HEAD, now: NOW }).rule,
    'certificate-empty-or-skipped'
  );

  // Rule 4: verdict must be READY_FOR_OCEAN.
  assert.equal(
    validateFleetPreCertificate([freshCert({ verdict: 'RETURN_TO_BUILDER' })], { headSha: HEAD, now: NOW }).rule,
    'verdict-not-ready-for-ocean'
  );

  // Rule 5: stale certificate (default max-age 24h).
  const stale = new Date(NOW - (DEFAULT_MAX_AGE_HOURS + 1) * 3600000).toISOString();
  assert.equal(
    validateFleetPreCertificate([freshCert({ createdAt: stale })], { headSha: HEAD, now: NOW }).rule,
    'stale-certificate'
  );

  // Rule 6: ambiguous/conflicting sources.
  assert.equal(
    validateFleetPreCertificate(
      [freshCert({ verdict: 'READY_FOR_OCEAN', source: 'issue-80' }), freshCert({ verdict: 'RETURN_TO_BUILDER', source: 'data:file.json' })],
      { headSha: HEAD, now: NOW }
    ).rule,
    'source-unavailable-or-ambiguous'
  );

  // Rule 7: exact fresh certificate passes.
  const ok = validateFleetPreCertificate([freshCert()], { headSha: HEAD, now: NOW });
  assert.equal(ok.verdict, 'READY_FOR_OCEAN');
  assert.equal(ok.rule, 'ready-for-ocean');
  assert.equal(ok.certificate.exactHeadSha, HEAD);
});

test('invalid / missing head SHA blocks fail-closed', () => {
  assert.equal(validateFleetPreCertificate([freshCert()], { headSha: '', now: NOW }).rule, 'exact-head-mismatch');
  assert.equal(validateFleetPreCertificate([freshCert()], { headSha: 'short', now: NOW }).rule, 'exact-head-mismatch');
  assert.equal(isValidHeadSha(HEAD), true);
  assert.equal(isValidHeadSha(HEAD.toUpperCase()), false);
});

test('issue comment parsing is deterministic and exact-SHA', () => {
  assert.equal(MARKER_RE.source, /\[FLEET\]\[PRE_INTEGRATION_QA\]\[PR_(\d+)\]\[EXACT_HEAD_([0-9a-f]{40})\]/ .source);
  const cert = parseFleetCertComment(FRESH_COMMENT, FRESH, 'issue-80');
  assert.equal(cert.pr, 187);
  assert.equal(cert.exactHeadSha, HEAD);
  assert.equal(cert.verdict, 'READY_FOR_OCEAN');
  assert.equal(cert.createdAt, FRESH);

  const parsed = parseIssueComments([{ body: FRESH_COMMENT, created_at: FRESH }]);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].source, 'issue-80');

  assert.equal(parseIssueComments([{ body: 'no marker here', created_at: FRESH }]).length, 0);
  assert.equal(parseFleetCertComment('', FRESH, 'issue-80'), null);
});

test('data directory secondary certificates load and stay fail-closed', () => {
  const dir = path.join(ROOT, 'data', 'fleet-pre-certificates');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'sample.json');
  fs.writeFileSync(file, JSON.stringify([freshCert({ source: 'data:sample.json' })]));
  try {
    const certs = loadDataCerts(dir);
    assert.equal(certs.length >= 1, true);
    const withData = validateFleetPreCertificate(certs, { headSha: HEAD, now: NOW });
    assert.equal(withData.verdict, 'READY_FOR_OCEAN');
    assert.equal(withData.sources.some((s) => s.startsWith('data:')), true);
  } finally {
    fs.unlinkSync(file);
  }
  assert.equal(loadDataCerts(path.join(ROOT, 'does-not-exist-xyz')).length, 0);
});

test('bypass-class scan: workflow cannot be green without the exact-SHA cert check', () => {
  const workflow = read('.github/workflows/fleet-pre-merge-chain.yml');

  assert.ok(workflow.includes('on:'), 'workflow defines triggers');
  assert.ok(/pull_request\s*:\s*\n\s*branches:\s*\[master\]/.test(workflow), 'runs on every pull_request against master');
  assert.ok(workflow.includes('workflow_dispatch:'), 'supports manual dispatch');
  assert.ok(workflow.includes('contents: read'), 'minimum read-only permissions');

  // The enforcement job must be the check named fleet-pre-merge-chain.
  assert.ok(/checks:\s*\n\s*\-\s*name:\s*[Ff]leet[- ]pre[- ]merge[- ]chain/.test(workflow) ||
            /jobs:\s*\n\s*fleet-pre-merge-chain:/.test(workflow),
            'a check/job literally named fleet-pre-merge-chain exists');

  // The exact gate must be executed unconditionally (no paths filter, no types skip).
  assert.ok(!workflow.includes('paths:'), 'no paths filter may skip the gate on a PR');
  assert.ok(!/pull_request\s*:\s*[\s\S]*?types:\s*\[[^\]]*(closed|edited|reopened|labeled|assigned|unlabeled|unassigned|milestoned|demilestoned|review_requested|review_request_removed)[^\]]*\]/.test(workflow),
            'no PR types filter may exclude the gate');

  // Hard command that performs the cert check.
  assert.ok(workflow.includes('node scripts/check-fleet-pre-certificate.cjs'), 'gate executes the cert script');

  // Forbidden bypass patterns (#91/#113 class): || true, continue-on-error, if: always(), fallback green.
  assert.ok(!/check-fleet-pre-certificate\.cjs[^\n]*\|\|\s*true/.test(workflow), 'no || true around the gate');
  assert.ok(!workflow.includes('continue-on-error: true'), 'no continue-on-error');
  assert.ok(!/if:\s*always\(\)/.test(workflow), 'no if: always() green fallback');
  assert.ok(!workflow.includes('if-no-files-found: warn'), 'no missing-artifact warning that could turn red into green');
  assert.ok(!workflow.includes("echo 'skip'"), 'no explicit skip');
});

test('schema constant anchors the certificate format', () => {
  assert.equal(SCHEMA, 'fleet-pre-certificate-v1');
  assert.equal(DEFAULT_MAX_AGE_HOURS, 24);
});