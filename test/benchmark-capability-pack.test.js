const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8').replace(/^\uFEFF/, '');
const json = rel => JSON.parse(read(rel));
const worlds = ['voxel-world', 'ai3d-voxel-city', 'survival', 'world-sharabass', 'dark-void-scene'];

test('benchmark capability pack keeps reusable capability provenance', () => {
  const pack = json('data/benchmark-capability-pack.json');
  assert.equal(pack.schemaVersion, '1.0.0');
  assert.ok(pack.capabilities.length >= 10);
  assert.ok(pack.capabilities.some(item => item.id === 'wind-tornado-damage'));
  assert.ok(pack.capabilities.some(item => item.id === 'gravity-lensing'));
  assert.ok(pack.capabilities.some(item => item.id === 'adaptive-runtime-budget'));
});

test('benchmark capability runtime is wired into every internal story world', () => {
  for (const id of worlds) {
    assert.match(read(`apps/${id}/index.html`), /\/shared\/benchmark-capability-runtime\.js/);
  }
});

test('convergence world is registered, playable and has complete Golden Story lore', () => {
  const registry = json('data/app-release-registry.json');
  const lore = json('data/world-lore-v2.json');
  const meta = registry.apps['benchmark-convergence-world'];
  const story = lore.worlds['benchmark-convergence-world'];
  assert.equal(meta.visible, true);
  assert.equal(meta.status, 'certified');
  assert.equal(meta.kind, 'experience');
  assert.match(read('apps/benchmark-convergence-world/index.html'), /Сигналы: 0 \/ 7/);
  assert.match(read('apps/benchmark-convergence-world/game.js'), /ArrowRight/);
  assert.match(read('apps/benchmark-convergence-world/game.js'), /pointerdown/);
  for (const element of lore.requiredElements) assert.ok(story.elements.includes(element), element);
});

test('existing lore worlds link back to the convergence world', () => {
  const lore = json('data/world-lore-v2.json');
  for (const id of ['voxel-world', 'ai3d-voxel-city', 'survival', 'world-sharabass', 'dark-void-navigator-live']) {
    assert.ok(lore.worlds[id].connections.some(link => link.targetId === 'benchmark-convergence-world'), id);
  }
});
