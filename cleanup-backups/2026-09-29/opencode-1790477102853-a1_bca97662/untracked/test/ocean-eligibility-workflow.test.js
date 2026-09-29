'use strict';
// Structural regression guard for the hardened `Ocean merge eligibility` job.
// The decision logic is unit-tested in test/ocean-merge-eligibility.test.js;
// this file proves the workflow actually feeds it the evidence, and that the
// green readiness line is unreachable without that decision.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflows = path.join(__dirname, '../.github/workflows');
// The checked-in workflow uses CRLF on Windows; normalise before matching so
// these structural assertions cannot silently pass on a line-ending change.
const yaml = fs.readFileSync(path.join(workflows, 'fleet-pre-exact-sha.yml'), 'utf8')
  .replace(/\r\n/g, '\n');

const job = yaml.slice(yaml.indexOf('  ocean-eligibility:'));

test('the existing gate is hardened in place, not duplicated', () => {
  assert.match(yaml, /name: Ocean merge eligibility/);
  assert.equal((yaml.match(/name: Ocean merge eligibility/g) || []).length, 1);
  // No step in this workflow may print the positive readiness line itself; only
  // the fail-closed decision script running on trusted master may emit it.
  assert.doesNotMatch(yaml, /echo "READY_FOR_OCEAN=YES/);
  const competing = fs.readdirSync(workflows).filter(name => /ocean/i.test(name));
  assert.deepEqual(competing, [], 'no competing parallel Ocean gate workflow may exist');
  assert.equal(fs.existsSync(path.join(__dirname, '../scripts/ocean-merge-eligibility-gate.cjs')), false);
});

test('the certificate assertion is preserved', () => {
  assert.match(job, /test -n "\$CERTIFIED"/);
  assert.match(job, /test "\$CERTIFIED" = "\$EXPECTED"/);
  assert.match(job, /Reject missing or stale certificate/);
});

test('the job can read check runs without widening the workflow token', () => {
  assert.match(yaml, /^permissions:\n {2}contents: read$/m);
  assert.match(job, /permissions:\n {6}contents: read\n {6}checks: read/);
  assert.doesNotMatch(yaml, /checks: write/);
  assert.doesNotMatch(yaml, /contents: write/);
});

test('the independent review conclusion for the exact head is read', () => {
  assert.match(job, /World Independent Adversarial Review/);
  assert.match(job, /commits\/\$\{PR_HEAD\}\/check-runs/);
  assert.match(job, /\.conclusion/);
  assert.match(job, /sort_by\(\.id\) \| last/);
  assert.match(job, /--review-conclusion "\$REVIEW"/);
});

test('the pull request base is compared against the current master head', () => {
  assert.match(job, /git\/ref\/heads\/master/);
  assert.match(job, /--base-sha "\$BASE_SHA"/);
  assert.match(job, /--master-sha "\$MASTER_SHA"/);
});

test('a bounded poll waits for the separate reviewer instead of passing on pending', () => {
  assert.match(job, /DEADLINE=\$\(\( \$\(date \+%s\) \+ 480 \)\)/);
  assert.match(job, /sleep 15/);
  assert.match(job, /VERDICT="pending"/);
  assert.match(job, /VERDICT="absent"/);
  assert.match(job, /success\|failure\|action_required\) break/);
});

test('draft state and PR context come from the pull request payload', () => {
  assert.match(job, /PR_DRAFT: \$\{\{ github\.event\.pull_request\.draft \}\}/);
  assert.match(job, /PR_BASE: \$\{\{ github\.event\.pull_request\.base\.sha \}\}/);
  assert.match(job, /--is-draft "\$DRAFT"/);
});

test('workflow_dispatch is preserved instead of failing for missing PR context', () => {
  assert.match(yaml, /^\s+workflow_dispatch:$/m);
  assert.match(job, /READY_FOR_OCEAN=SKIPPED_NO_PR_CONTEXT/);
  assert.match(job, /if test -z "\$PR_HEAD"/);
});

test('trusted master code is executed, never pull request code', () => {
  assert.match(job, /ref: \$\{\{ steps\.context\.outputs\.master \}\}/);
  assert.match(job, /persist-credentials: false/);
  assert.doesNotMatch(job, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \}\}/);
  assert.match(job, /node-version: 24/);
});

test('an uninstalled guard refuses readiness instead of pretending it ran', () => {
  assert.match(job, /READY_FOR_OCEAN=SKIPPED_GUARD_NOT_INSTALLED/);
  assert.match(job, /if test ! -f scripts\/ocean-merge-eligibility\.cjs/);
});
