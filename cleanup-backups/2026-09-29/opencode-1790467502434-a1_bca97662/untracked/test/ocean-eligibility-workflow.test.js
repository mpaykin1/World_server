'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflows = path.join(__dirname, '../.github/workflows');
// Windows checkouts deliver CRLF; assert against normalised text so the same
// assertions hold on Linux CI.
const yaml = fs.readFileSync(path.join(workflows, 'fleet-pre-exact-sha.yml'), 'utf8').replace(/\r\n/g, '\n');
// Scope security assertions to the job under change: fleet-pre legitimately
// checks out the candidate head to execute its own test suite.
const oceanJob = yaml.slice(yaml.search(/^ {2}ocean-eligibility:$/m));
const fleetJob = yaml.slice(0, yaml.search(/^ {2}ocean-eligibility:$/m));

test('the existing job is hardened in place, with no parallel gate or duplicate workflow', () => {
  assert.match(yaml, /^ {2}ocean-eligibility:$/m);
  assert.match(yaml, /name: Ocean merge eligibility/);
  assert.match(yaml, /needs: fleet-pre/);
  const oceanFiles = fs.readdirSync(workflows).filter(x => /ocean/i.test(x));
  assert.deepEqual(oceanFiles, []);
});

test('the job runs the fail-closed decision from trusted master, never from the PR head', () => {
  assert.match(oceanJob, /ref: \$\{\{ steps\.refs\.outputs\.master \}\}/);
  assert.match(oceanJob, /persist-credentials: false/);
  assert.match(oceanJob, /node scripts\/ocean-merge-eligibility\.cjs/);
  assert.match(oceanJob, /git\/ref\/heads\/master/);
  assert.doesNotMatch(oceanJob, /ref: \$\{\{ github\.event\.pull_request\.head\.sha/);
  assert.doesNotMatch(oceanJob, /ref: \$\{\{ github\.sha \}\}/);
});

test('the job can read check-runs and pull request state it must not assume', () => {
  assert.match(oceanJob, /permissions:\n {6}contents: read\n {6}checks: read\n {6}pull-requests: read/);
  assert.match(oceanJob, /CERT_SHA: \$\{\{ needs\.fleet-pre\.outputs\.sha \}\}/);
  assert.match(oceanJob, /EVENT_HEAD: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(oceanJob, /PR_NUMBER: \$\{\{ github\.event\.pull_request\.number \|\| '' \}\}/);
});

test('the unconditional pre-fix READY echo is gone and cannot be reintroduced', () => {
  assert.doesNotMatch(yaml, /READY_FOR_OCEAN=YES SHA=\$CERTIFIED/);
  assert.doesNotMatch(yaml, /test "\$CERTIFIED" = "\$EXPECTED"/);
  assert.doesNotMatch(yaml, /Reject missing or stale certificate/);
});

test('the Fleet PRE certificate job is untouched and still binds the exact head', () => {
  assert.match(fleetJob, /id: identity/);
  assert.match(fleetJob, /ACTUAL="\$\(git rev-parse HEAD\)"/);
  assert.match(fleetJob, /test "\$ACTUAL" = "\$EXPECTED"/);
  assert.match(fleetJob, /sha: \$\{\{ steps\.identity\.outputs\.sha \}\}/);
  assert.match(fleetJob, /npm run check:fast/);
});
