'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyDevice, budgetForDevice, AdaptiveBudgetController } = require('../lib/world-procedural-budget');

test('device classifier keeps weak mobile hardware in conservative tier', () => {
  assert.equal(classifyDevice({ isMobile: true, deviceMemory: 2, hardwareConcurrency: 2, gpuTier: 0 }), 'low');
  assert.equal(classifyDevice({ isMobile: false, deviceMemory: 16, hardwareConcurrency: 16, gpuTier: 4, maxTextureSize: 16384 }), 'ultra');
});

test('device budgets scale while preserving hard limits', () => {
  const low = budgetForDevice({ performance: { targetFps: 60 } }, { forceTier: 'low' }, 0.5);
  const high = budgetForDevice({ performance: { targetFps: 60 } }, { forceTier: 'high' }, 1);
  assert.ok(low.maxActiveVoxels < high.maxActiveVoxels);
  assert.ok(low.maxChunkVoxels >= 512);
  assert.equal(low.targetFps, 60);
});

test('adaptive controller reduces quality under sustained slow frames', () => {
  const controller = new AdaptiveBudgetController({ targetFps: 60, cooldownFrames: 10, initialQualityScale: 1 });
  for (let i = 0; i < 80; i += 1) controller.observeFrame(40);
  assert.ok(controller.snapshot().qualityScale < 1);
});

test('adaptive controller can recover quality when frames are consistently fast', () => {
  const controller = new AdaptiveBudgetController({ targetFps: 60, cooldownFrames: 10, initialQualityScale: 0.7 });
  for (let i = 0; i < 160; i += 1) controller.observeFrame(6);
  assert.ok(controller.snapshot().qualityScale > 0.7);
  assert.ok(controller.snapshot().qualityScale <= 1.25);
});
