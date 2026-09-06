'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { RecipeCache, encodeBrotli, decodeBrotli } = require('../lib/world-procedural-cache');

test('memory recipe cache is LRU bounded', () => {
  const cache = new RecipeCache({ maxEntries: 4, maxBytes: 1024 * 1024 });
  for (let i = 0; i < 6; i += 1) cache.set(`k${i}`, { i });
  assert.equal(cache.map.size, 4);
  assert.equal(cache.get('k0'), undefined);
  assert.deepEqual(cache.get('k5'), { i: 5 });
});

test('brotli round-trip keeps recipe payload exact', () => {
  const value = { worldId: 'main', seed: 10, style: { detail: 0.8 }, values: [1, 2, 3] };
  assert.deepEqual(decodeBrotli(encodeBrotli(value)), value);
});
