'use strict';
// The daily auto-fix opened a pull request even when it fixed nothing: it committed every report
// JSON the release gate rewrites (#483 … #504, all with `changes: []`). A PR now needs a real fix,
// and only the fixed files are committed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');

const file = path.join(__dirname, '..', '.github', 'workflows', 'quality-autofix-pr.yml');
const steps = yaml.load(fs.readFileSync(file, 'utf8'), { schema: yaml.CORE_SCHEMA }).jobs.autofix.steps;
const byName = (name) => steps.findIndex((step) => step.name === name);

test('real fixes are detected from the auto-fix report before the gate rewrites reports', () => {
  const detect = byName('Detect real fixes');
  assert.ok(detect > byName('Apply deterministic safe fixes'), 'detection follows the auto-fix');
  assert.ok(detect < byName('Verify candidate'), 'detection precedes the release gate');
  assert.equal(steps[detect].id, 'diff');
  assert.match(steps[detect].run, /AUTOFIX_REPORT\.json/);
  assert.match(steps[detect].run, /\.filter\(c=>c\.applied\)/);
  assert.doesNotMatch(steps[detect].run, /git diff --quiet/);
});

test('the pull request commits only the fixed files', () => {
  const create = steps[byName('Create quality branch and PR')];
  assert.equal(create.if, "steps.diff.outputs.changed == 'true'");
  assert.match(create.run, /xargs -a "\$RUNNER_TEMP\/autofix-files\.txt" -d '\\n' git add --/);
  assert.doesNotMatch(create.run, /git add (\.|-A|--all)(\s|$)/);
});
