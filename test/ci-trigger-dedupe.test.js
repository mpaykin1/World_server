'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const workflowPath = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');

function workflowText() {
  return fs.readFileSync(workflowPath, 'utf8');
}

test('heavy CI validates PRs/master while unrelated world-specific browser checks cannot block publication', () => {
  const text = workflowText();

  assert.match(text, /on:\s*\n\s*push:\s*\n\s*branches:\s*\[master\]/, 'push CI must be limited to master');
  assert.match(text, /pull_request:\s*\n\s*branches:\s*\[master\]/, 'pull_request CI must continue to validate master-bound PRs');
  assert.doesNotMatch(text, /push:\s*\n\s*branches:\s*\["?\*\*"?\]/, 'non-master branch pushes must not duplicate heavy PR CI');

  assert.match(text, /Detect AI3D Voxel City impact/, 'world-specific autoplay must be impact-aware');
  assert.match(text, /if:\s*steps\.ai3d-impact\.outputs\.run == 'true'/, 'AI3D autoplay remains a hard gate when its world is impacted');
  assert.match(text, /npx playwright test e2e\/ai3d-voxel-city-autoplay\.spec\.js --project=desktop-chromium --retries=2/, 'AI3D autoplay must run only its own spec with transient retries');
  assert.doesNotMatch(text, /^\s*run:\s*npx playwright test\s*$/m, 'a world-specific gate must never accidentally execute the entire Playwright suite');
  assert.match(text, /publication is not blocked by an unrelated world-specific browser test/, 'unrelated changes must receive an explicit non-blocking path');
  assert.match(text, /cancel-in-progress:\s*true/, 'stale duplicate CI runs should be cancelled');
});
