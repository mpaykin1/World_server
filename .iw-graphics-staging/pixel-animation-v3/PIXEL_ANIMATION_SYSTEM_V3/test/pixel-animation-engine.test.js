'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const PixelAnimation = require('../shared/pixel-animation-engine.js');

test('profiles normalize to stable numeric shader params', () => {
  const bird = PixelAnimation.profileParams(PixelAnimation.DEFAULT_PROFILES.bird);
  assert.equal(bird.kindId, PixelAnimation.PROFILE_IDS.bird);
  assert.ok(bird.wingAmplitude === undefined);
  assert.ok(bird.amp1 > 0);
  assert.ok(bird.freq1 > 0);
});

test('device tier is conservative on weak/mobile hardware', () => {
  assert.equal(PixelAnimation.chooseDeviceTier({ webgl2: false }, PixelAnimation.DEFAULT_POLICY), 'low');
  assert.equal(PixelAnimation.chooseDeviceTier({ webgl2: true, mobile: true, deviceMemory: 4, hardwareConcurrency: 4, maxTextureSize: 4096 }, PixelAnimation.DEFAULT_POLICY), 'medium');
  assert.equal(PixelAnimation.chooseDeviceTier({ webgl2: true, mobile: false, deviceMemory: 16, hardwareConcurrency: 12, maxTextureSize: 16384 }, PixelAnimation.DEFAULT_POLICY), 'ultra');
});

test('spatial hash returns only intersecting cells and removes cleanly', () => {
  const grid = new PixelAnimation.SpatialHashGrid(100);
  grid.upsert('a', { x: 0, y: 0, w: 20, h: 20 });
  grid.upsert('b', { x: 1000, y: 1000, w: 20, h: 20 });
  const near = grid.query({ x: -10, y: -10, w: 80, h: 80 });
  assert.equal(near.has('a'), true);
  assert.equal(near.has('b'), false);
  grid.remove('a');
  assert.equal(grid.query({ x: -10, y: -10, w: 80, h: 80 }).has('a'), false);
});

test('grid mesh is a reusable subdivided sprite surface', () => {
  const mesh = PixelAnimation.buildGridMesh(8);
  assert.equal(mesh.vertices.length, 9 * 9 * 4);
  assert.equal(mesh.indices.length, 8 * 8 * 6);
});

test('remote config merge keeps required fallbacks', () => {
  const policy = PixelAnimation.normalizePolicy({ tiers: { low: { maxVisible: 123 } } });
  assert.equal(policy.tiers.low.maxVisible, 123);
  assert.ok(policy.tiers.high.maxVisible > 0);
});
