'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const mod = require('../scripts/cpu-asset-transcode.js');

test('derived texture uses ktx2 without overwriting source', () => {
  assert.equal(mod.derivedTexturePath('/x/stone.png'), '/x/stone.ktx2');
  assert.notEqual(mod.derivedTexturePath('/x/stone.png'), '/x/stone.png');
});
test('derived model preserves source and uses optimized suffix', () => {
  const out = mod.derivedModelPath(path.join('/x','hero.glb'));
  assert.match(out.replaceAll('\\','/'), /hero\.optimized\.glb$/);
});
