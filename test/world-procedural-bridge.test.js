'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileWorldRecipe } = require('../lib/world-procedural-recipe-engine');
const { attachCompiledRecipe, generateStandaloneWorld, makeRealtimeRecipeEvent, validateRealtimeRecipeEvent } = require('../lib/world-procedural-bridge');

test('bridge attaches recipe without deleting existing world metadata', () => {
  const world = { id: 'main', custom: { keep: true }, performance: { existingFlag: true } };
  const compiled = compileWorldRecipe({ worldId: 'main', seed: 99 }, { forceTier: 'low' });
  attachCompiledRecipe(world, compiled);
  assert.equal(world.custom.keep, true);
  assert.equal(world.performance.existingFlag, true);
  assert.equal(world.proceduralRecipe.contentHash, compiled.contentHash);
});

test('standalone world generator produces a playable-compatible voxel shell', () => {
  const world = generateStandaloneWorld({ worldId: 'generated', seed: 7, architecture: { kind: 'ruins', density: 1 } }, { forceTier: 'low' }, { enhanceExisting: false, chunks: [[0, 0], [1, 0]] });
  assert.ok(world.voxels.length > 0);
  assert.ok(world.palette.length >= 14);
  assert.equal(world.id, 'generated');
  assert.equal(world.proceduralChunks.length, 2);
});

test('realtime recipe event validates canonical contract', () => {
  const compiled = compileWorldRecipe({ worldId: 'main', seed: 11 });
  const event = makeRealtimeRecipeEvent(compiled);
  assert.equal(validateRealtimeRecipeEvent(event), true);
  assert.equal(validateRealtimeRecipeEvent({ ...event, contentHash: 'bad' }), false);
});
