'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');

function workflowText() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('heavy CI validates PRs and master pushes without duplicate PR-head push runs', () => {
  const text = workflowText();

  assert.match(text, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[master\]/, 'push CI must be limited to master');
  assert.match(text, /pull_request:\s*\n\s*branches:\s*\[master\]/, 'pull_request CI must continue to validate master-bound PRs');
  assert.doesNotMatch(text, /push:\s*\n\s*branches:\s*\["?\*\*"?\]/, 'non-master branch pushes must not duplicate heavy PR CI');
  assert.match(text, /AI3D Voxel City autoplay \(Playwright\).*\(hard\)/, 'hard autoplay gate must remain enabled');
});
