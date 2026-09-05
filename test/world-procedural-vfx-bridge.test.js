'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { compileWorldRecipe } = require('../lib/world-procedural-recipe-engine');
const { makeRealtimeRecipeEvent } = require('../lib/world-procedural-bridge');
const { buildVfxPlan, installIntoVfxRuntime } = require('../lib/world-procedural-vfx-bridge');

test('gothic architecture recipe maps to a transformation VFX intent', () => {
  const plan = buildVfxPlan({ worldId: 'main', seed: 1, architecture: { kind: 'gothic', density: 0.8, ruin: 0.2 } });
  assert.equal(plan.events.length, 1);
  assert.equal(plan.events[0].intent, 'transformation');
  assert.ok(plan.events[0].importance > 0.5);
});

test('ruins architecture recipe maps to a discovery VFX intent', () => {
  const plan = buildVfxPlan({ worldId: 'main', seed: 2, architecture: { kind: 'ruins', density: 0.5, ruin: 0.6 } });
  assert.equal(plan.events[0].intent, 'discovery');
});

test('forest architecture recipe maps to a calm VFX intent', () => {
  const plan = buildVfxPlan({ worldId: 'main', seed: 3, architecture: { kind: 'forest' } });
  assert.equal(plan.events[0].intent, 'calm');
});

test('no architecture falls back to atmosphere-derived intent', () => {
  const dark = buildVfxPlan({ worldId: 'main', seed: 4, atmosphere: { darkness: 0.9 } });
  assert.equal(dark.events[0].intent, 'danger');
  const clear = buildVfxPlan({ worldId: 'main', seed: 5, atmosphere: { darkness: 0.1, fog: 0.1 } });
  assert.equal(clear.events[0].intent, 'reveal');
});

test('accepts a makeRealtimeRecipeEvent() envelope directly', () => {
  const compiled = compileWorldRecipe({ worldId: 'main', seed: 6, architecture: { kind: 'ruins', density: 1 } }, { forceTier: 'low' });
  const event = makeRealtimeRecipeEvent(compiled);
  const plan = buildVfxPlan(event);
  assert.equal(plan.worldId, 'main');
  assert.equal(plan.events[0].intent, 'discovery');
});

test('same recipe produces a deterministic plan', () => {
  const a = buildVfxPlan({ worldId: 'main', seed: 42, architecture: { kind: 'gothic', density: 0.4 } });
  const b = buildVfxPlan({ worldId: 'main', seed: 42, architecture: { kind: 'gothic', density: 0.4 } });
  assert.deepEqual(a, b);
});

test('installIntoVfxRuntime calls semantic() once per plan event and counts spawned effects', () => {
  const calls = [];
  const runtime = { semantic: (detail) => { calls.push(detail); return ['pulse', 'sparks']; } };
  const plan = buildVfxPlan({ worldId: 'main', seed: 7, architecture: { kind: 'gothic' } });
  const result = installIntoVfxRuntime(runtime, plan);
  assert.equal(calls.length, 1);
  assert.equal(result.mode, 'semantic');
  assert.equal(result.installed, 2);
});

test('installIntoVfxRuntime degrades safely with no VFX runtime present', () => {
  const plan = buildVfxPlan({ worldId: 'main', seed: 8, architecture: { kind: 'gothic' } });
  const result = installIntoVfxRuntime(null, plan);
  assert.equal(result.mode, 'adapter-required');
  assert.equal(result.installed, 0);
});
