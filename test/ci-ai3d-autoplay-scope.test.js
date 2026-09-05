const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('CI AI3D autoplay job stays scoped to its dedicated spec', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml'), 'utf8');
  const marker = 'AI3D Voxel City autoplay (Playwright) ai3d-voxel-city-autoplay (hard)';
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, 'AI3D autoplay hard gate must exist');
  const block = workflow.slice(start, workflow.indexOf('\n\n', start));
  assert.match(block, /npx playwright test e2e\/ai3d-voxel-city-autoplay\.spec\.js/);
  assert.doesNotMatch(block, /run:\s*npx playwright test\s*$/m, 'hard gate must not run the entire Playwright suite');
});