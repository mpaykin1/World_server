'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../shared/world-procedural-core');
const { compileWorldRecipe, evolveWorldRecipe, navigatorMutation, createRecipeDeltaPacket, applyRecipeDeltaPacket } = require('../lib/world-procedural-recipe-engine');

test('same recipe compiles to the same deterministic hash', () => {
  const input = { worldId: 'main', seed: 'same-seed', style: { detail: 0.87, wetness: 0.4 }, terrain: { kind: 'city', amplitude: 7 } };
  const a = compileWorldRecipe(input, { forceTier: 'medium' });
  const b = compileWorldRecipe(input, { forceTier: 'medium' });
  assert.equal(a.contentHash, b.contentHash);
  assert.deepEqual(a.recipe, b.recipe);
});

test('recipe evolution increments revision and preserves seed unless explicitly changed', () => {
  const a = compileWorldRecipe({ worldId: 'main', seed: 7331, revision: 4 });
  const b = evolveWorldRecipe(a.recipe, { style: { detail: 0.95 } });
  assert.equal(b.recipe.revision, 5);
  assert.equal(b.recipe.seed, a.recipe.seed);
  assert.equal(b.recipe.style.detail, 0.95);
});

test('navigator message is hashed instead of retained as raw text', () => {
  const a = compileWorldRecipe({ worldId: 'main', seed: 1 });
  const b = navigatorMutation(a.recipe, { message: 'secret scene description', recipePatch: { atmosphere: { fog: 0.9 } } });
  assert.equal(b.recipe.source.navigatorTurn, 1);
  assert.notEqual(b.recipe.source.sourceMessageHash32, 0);
  assert.equal(JSON.stringify(b.recipe).includes('secret scene description'), false);
});

test('delta packet round-trips with content-hash verification', () => {
  const a = compileWorldRecipe({ worldId: 'main', seed: 2 });
  const b = evolveWorldRecipe(a.recipe, { terrain: { amplitude: 22 }, architecture: { kind: 'gothic', density: 0.55 } });
  const packet = createRecipeDeltaPacket(a, b);
  const restored = applyRecipeDeltaPacket(a, packet);
  assert.equal(restored.contentHash, b.contentHash);
});

test('voxel chunks are deterministic and budget-bounded', () => {
  const recipe = { worldId: 'main', seed: 88, architecture: { kind: 'tower', density: 1 } };
  const a = core.generateVoxelChunk(recipe, 1, 1, { maxVoxels: 900, surfaceDepth: 2 });
  const b = core.generateVoxelChunk(recipe, 1, 1, { maxVoxels: 900, surfaceDepth: 2 });
  assert.deepEqual(a.voxels, b.voxels);
  assert.ok(a.voxels.length > 0 && a.voxels.length <= 900);
});
