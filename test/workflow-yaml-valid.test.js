'use strict';
// Every workflow file must parse. GitHub reports an invalid workflow file as a failed run on
// every push to every branch: ai-bridge-ingress.yml was invalid from 2026-10-06 to 2026-10-14,
// so every commit and pull request showed a red result that was not a code defect.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml'); // version pinned in package.json overrides, installed with @lhci/cli

const dir = path.join(__dirname, '..', '.github', 'workflows');
const files = fs.readdirSync(dir).filter((file) => /\.ya?ml$/.test(file)).sort();

function parse(file) {
  // CORE_SCHEMA is safe in js-yaml 3 and 4 alike: no custom JS types.
  return yaml.load(fs.readFileSync(path.join(dir, file), 'utf8'), { schema: yaml.CORE_SCHEMA, filename: file });
}

test('workflow directory has workflow files', () => {
  assert.ok(files.length > 0);
});

for (const file of files) {
  test(`${file} parses and declares triggers and jobs`, () => {
    const doc = parse(file);
    assert.ok(doc && typeof doc === 'object', `${file}: not a mapping`);
    assert.ok(doc.on !== undefined && doc.on !== null, `${file}: no "on" triggers`);
    assert.ok(doc.jobs && typeof doc.jobs === 'object' && Object.keys(doc.jobs).length > 0, `${file}: no jobs`);
    for (const [id, job] of Object.entries(doc.jobs)) {
      assert.ok(Array.isArray(job.steps) || typeof job.uses === 'string', `${file}: job ${id} has neither steps nor uses`);
    }
  });
}

test('a line at column 1 inside a script block is caught', () => {
  // The exact shape of the 2026-10-06 breakage: an unindented template-literal line ends the
  // `script: |` block scalar and `**Task ID:**` is then read as a YAML alias.
  const broken = [
    'on: push',
    'jobs:',
    '  a:',
    '    runs-on: ubuntu-latest',
    '    steps:',
    '      - uses: actions/github-script@v7',
    '        with:',
    '          script: |',
    '            const body = `### Title',
    '',
    '**Task ID:** ${id}',
    '`;',
  ].join('\n');
  assert.throws(() => yaml.load(broken, { schema: yaml.CORE_SCHEMA }));
});
