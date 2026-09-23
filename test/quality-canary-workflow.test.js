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

test('failed browser gates retain structured evidence without turning failures green', () => {
  assert.match(workflow, /PLAYWRIGHT_JSON_OUTPUT_NAME: test-results\/playwright-results.json/);
  assert.match(workflow, /playwright test --reporter=line,json,html/);
  assert.match(workflow, /failure\(\) && steps.browser.outcome == 'failure'/);
  assert.match(workflow, /node scripts\/summarize-playwright-failure.js/);
  const upload = workflow.slice(workflow.indexOf('- name: Preserve canary evidence'));
  assert.match(upload, /if: always\(\)/);
  assert.match(upload, /actions\/upload-artifact@v4/);
  assert.match(upload, /test-results\/[\s\S]*playwright-report\//);
  assert.match(upload, /github.sha[\s\S]*github.run_attempt/);
  assert.doesNotMatch(workflow, /continue-on-error|\|\| true/);
});
