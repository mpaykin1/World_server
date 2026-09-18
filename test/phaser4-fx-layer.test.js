const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const fx = fs.readFileSync(path.join(root, 'shared/graphics/phaser4-fx-layer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'apps/voxel-world/index.html'), 'utf8');
const client = fs.readFileSync(path.join(root, 'apps/voxel-world/client.js'), 'utf8');

test('Phaser 4 hybrid FX layer is pinned and wired', () => {
  assert.match(fx, /PHASER_VERSION = '4\.2\.1'/);
  assert.match(fx, /cdn\.jsdelivr\.net\/npm\/phaser@/);
  assert.match(html, /\/shared\/graphics\/phaser4-fx-layer\.js/);
  assert.match(client, /WorldPhaserFx\?\.emit/);
  assert.match(client, /phaserFx:window\.WorldPhaserFx\?\.stats/);
});

test('Phaser FX layer has performance safeguards', () => {
  assert.match(fx, /prefers-reduced-motion/);
  assert.match(fx, /actualFps/);
  assert.match(fx, /disabledUntil/);
  assert.match(fx, /requestIdleCallback/);
});
