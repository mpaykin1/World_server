'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const workflow = fs.readFileSync(path.join(__dirname, '../.github/workflows/cloudflare-preview.yml'), 'utf8');

test('Cloudflare preview checks out the exact PR head instead of a synthetic merge ref', () => {
  const exactRef = 'ref: ' + '$' + '{{ github.event.pull_request.head.sha || github.sha }}';
  assert.match(workflow, /- uses: actions\/checkout@v4\s+with:/);
  assert.ok(workflow.includes(exactRef));
  assert.ok(workflow.includes('SOURCE_SHA: ' + '$' + '{{ github.event.pull_request.head.sha || github.sha }}'));
});

test('Cloudflare deploy waits for verified activation before full stack and browser checks', () => {
  const wait = workflow.indexOf('node scripts/wait-for-cloudflare-deploy.cjs');
  const stack = workflow.indexOf('node scripts/verify-cloudflare-stack.cjs');
  const browser = workflow.indexOf('npm run delivery:verify');
  assert.ok(wait > 0 && stack > wait && browser > stack);
  assert.ok(workflow.includes('Fail closed when Cloudflare credentials are unavailable'));
});

test('Cloudflare preview requires concurrent desktop/mobile online presence after playable delivery', () => {
  const playable = workflow.indexOf('npm run delivery:verify');
  const multiplayer = workflow.indexOf('npm run delivery:two-player');
  assert.ok(playable > 0 && multiplayer > playable);
  assert.match(workflow, /name: Verify two independent realtime browser sessions/);
  assert.match(workflow, /if: steps\.authority\.outputs\.configured == 'true'/);
});

test('control-only changes skip preview while runtime and mixed changes still deploy', () => {
  assert.match(workflow, /predicate-quantifier: every/);
  const block = workflow.match(/            deploy:\n([\s\S]*?)(?=^      - )/m);
  assert.ok(block, 'scope must remain an explicit path-filter rule list');
  const patterns = [...block[1].matchAll(/- '([^']+)'/g)].map(match => match[1]);
  const deploy = files => files.some(file => patterns.every(pattern =>
    pattern.startsWith('!') ? !path.matchesGlob(file, pattern.slice(1))
      : path.matchesGlob(file, pattern)));
  const control = 'architecture/meta-games-platform/CONTROL_RULES_RU.md';
  const notes = 'work-notes/ai/codex/task.md';
  assert.equal(deploy([control, notes, 'test/cloudflare-preview-workflow.test.js',
    '.github/workflows/cloudflare-preview.yml']), false);
  for (const runtime of ['api/apps.js', 'apps/voxel-world/client.js',
    'architecture/meta-games-platform/mcp/worker.mjs',
    'architecture/meta-games-platform/ASSET_INDEX.json', 'wrangler.jsonc',
    'shared/common.js', 'package.json', 'scripts/verify-cloudflare-stack.cjs',
    'work-notes/runtime.js']) {
    assert.equal(deploy([runtime]), true, runtime);
    assert.equal(deploy([control, notes, runtime]), true, 'mixed: ' + runtime);
  }
  assert.match(workflow, /no live verification was performed/);
  assert.match(workflow, /if: steps\.scope\.outputs\.deploy != 'true'/);
});
