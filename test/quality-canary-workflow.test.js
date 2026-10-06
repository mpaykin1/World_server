'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/quality-canary.yml'), 'utf8');

test('fresh canary installs CPU Voxel City dependencies before release gate', () => {
  const py = workflow.indexOf('actions/setup-python@v5');
  const deps = workflow.indexOf('Install Voxel City verifier dependencies');
  const release = workflow.indexOf('name: Release gate');
  assert.ok(py > 0 && deps > py && release > deps, 'Python dependencies must precede release gate');
  assert.match(workflow, /python -m pip install .*pillow.*numpy.*requests/);
});

test('canary still requires Cloudflare authority and verifies deployed exact SHA', () => {
  assert.match(workflow, /Fail closed when Cloudflare credentials are unavailable/);
  assert.match(workflow, /Verify Cloudflare stack and exact SHA/);
  assert.match(workflow, /Browser gate against Cloudflare canary/);
  assert.match(workflow, /Verify playable delivery/);
});
