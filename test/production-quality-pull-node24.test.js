'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'scripts', 'production-quality-pull.js');

test('production quality pull remains unambiguous CommonJS on Node 24+', () => {
  const run = spawnSync(process.execPath, [script], {
    cwd: root,
    env: { ...process.env, QUALITY_BASE_URL: 'http://127.0.0.1:9' },
    encoding: 'utf8',
    timeout: 5000,
  });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.doesNotMatch(output, /ERR_AMBIGUOUS_MODULE_SYNTAX|Cannot determine intended module format/);
  assert.match(output, /\[PRODUCTION_QUALITY\] fatal:/, 'script must parse and reach its controlled network-error path');
  assert.equal(run.status, 1);
});
