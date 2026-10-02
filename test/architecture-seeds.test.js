'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSeedKey, seed32FromKey, createArchitectureDNA,
  sampleBuildingRecipe, huntArchitectureSeeds
} = require('../lib/architecture-seeds');

test('architecture DNA is deterministic for the same exact seed', () => {
  const a = createArchitectureDNA({ seed: '-3361685360695458093', idea: 'затопленный готический город в джунглях' });
  const b = createArchitectureDNA({ seed: '-3361685360695458093', idea: 'затопленный готический город в джунглях' });
  assert.deepEqual(a, b);
  assert.equal(a.seedKey, '-3361685360695458093');
  assert.equal(a.primaryFamily, 'gothic');
  assert.ok(a.modifiers.includes('jungle'));
  assert.ok(a.modifiers.includes('flooded'));
});

test('64-bit-like seed strings stay exact while legacy terrain receives stable 32-bit lane', () => {
  const raw = '184290855362048334';
  assert.equal(normalizeSeedKey(raw), raw);
  assert.equal(seed32FromKey(raw, 'voxel'), seed32FromKey(raw, 'voxel'));
  assert.notEqual(seed32FromKey(raw, 'voxel'), seed32FromKey(raw, 'roads'));
});

test('requested architecture families and modifiers are detected', () => {
  const dna = createArchitectureDNA({ seed: '350362654', idea: 'Tokyo future city with flooded ruins' });
  assert.equal(dna.primaryFamily, 'tokyo');
  assert.ok(dna.blend.some(x => x.family === 'future'));
  assert.ok(dna.modifiers.includes('flooded'));
  assert.ok(dna.modifiers.includes('ruins'));
});

test('building recipe is deterministic by seed and world coordinates', () => {
  const dna = createArchitectureDNA({ seed: '42', idea: 'древняя китайская архитектура' });
  const a = sampleBuildingRecipe(dna, { x: 128, z: -32, lotWidth: 14, lotDepth: 18 });
  const b = sampleBuildingRecipe(dna, { x: 128, z: -32, lotWidth: 14, lotDepth: 18 });
  const c = sampleBuildingRecipe(dna, { x: 192, z: -32, lotWidth: 14, lotDepth: 18 });
  assert.deepEqual(a, b);
  assert.equal(a.family, 'ancient_chinese');
  assert.notDeepEqual(a, c);
});

test('seed hunter is deterministic and ranks requested rare combinations', () => {
  const options = { startSeed: '1000', count: 64, idea: 'gothic flooded ruins', criteria: { family: 'gothic', modifiers: ['flooded', 'ruins'] }, limit: 6 };
  const a = huntArchitectureSeeds(options);
  const b = huntArchitectureSeeds(options);
  assert.deepEqual(a, b);
  assert.equal(a.length, 6);
  assert.ok(a.every((row, index) => index === 0 || a[index - 1].score >= row.score));
  assert.ok(a.every(row => row.primaryFamily === 'gothic' && row.modifiers.includes('flooded') && row.modifiers.includes('ruins')));
});
