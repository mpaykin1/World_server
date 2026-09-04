'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const cf = require('../lib/creature-factory');

const POLICY = path.join(__dirname, '..', 'data', 'creature-lod-policy.json');
const EXPECTED_CATEGORIES = [
  'reptile','croc_teeth','fish','dragon','dragon_fire',
  'human','human_sword','human_torch','human_gun',
  'ship','steampunk_vehicle','creature','monster'
];

function htmlAsset(overrides = {}) {
  return {
    format: 'zero-signal-procedural-asset-v1',
    category: 'creature',
    name: 'Test Creature',
    params: { seed: 'alpha', height: 12, detail: 1.2 },
    materialSettings: { shaderPreset: 1, skinPreset: 2, glossAmount: 0.3 },
    object: { metadata: { version: 4 }, geometries: [{ uuid: 'g1' }] },
    ...overrides
  };
}

function godotAsset(overrides = {}) {
  return {
    format: 'zero-signal-godot-procedural-asset-v1',
    category: 'dragon',
    name: 'Godot Dragon',
    params: { seed: 'beta', wing: 2 },
    controls: { rotation: 0, speed: 1, amplitude: 1, hatching: 2.5, density: 2 },
    ...overrides
  };
}

test('accepts both user editor formats', () => {
  assert.equal(cf.validateFormat(htmlAsset()).ok, true);
  assert.equal(cf.validateFormat(godotAsset()).ok, true);
});

test('accepts exactly the 13 editor categories', () => {
  assert.deepEqual(cf.CATEGORIES, EXPECTED_CATEGORIES);
  for (const category of EXPECTED_CATEGORIES) {
    assert.equal(cf.validateFormat(htmlAsset({ category })).ok, true, category);
  }
});

test('rejects malformed format/category/null', () => {
  assert.equal(cf.validateFormat(null).ok, false);
  assert.equal(cf.validateFormat(htmlAsset({ format: 'wrong-v9' })).ok, false);
  assert.equal(cf.validateFormat(htmlAsset({ category: 'beast' })).ok, false);
  assert.equal(cf.validateFormat({ format: 'zero-signal-procedural-asset-v1' }).ok, false);
});

test('buildRecipe is deterministic and seed-aware', () => {
  const a = cf.buildRecipe(htmlAsset());
  const b = cf.buildRecipe(htmlAsset());
  assert.equal(a.hash, b.hash);
  assert.equal(a.seed, 'alpha');
  assert.equal(cf.recipeHash(a), a.hash);
  const c = cf.buildRecipe(htmlAsset({ params: { seed: 'gamma', height: 12 } }));
  assert.notEqual(a.hash, c.hash);
});

test('canonical recipe preserves bounded settings but strips heavy source object', () => {
  const asset = htmlAsset({
    object: { hugeArray: new Array(1000).fill('payload-marker'), nested: { secretMarker: 'do-not-copy' } }
  });
  const r = cf.buildRecipe(asset);
  assert.equal(r.category, 'creature');
  assert.equal(r.materialSettings.shaderPreset, 1);
  assert.equal(typeof r.metadata.sourceHash, 'string');
  assert.ok(r.metadata.sourceBytes > 0);
  const s = JSON.stringify(r);
  assert.equal(s.includes('payload-marker'), false);
  assert.equal(s.includes('do-not-copy'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(r, 'object'), false);
});

test('Godot controls survive canonicalization without mesh payload', () => {
  const r = cf.buildRecipe(godotAsset());
  assert.equal(r.sourceFormat, 'zero-signal-godot-procedural-asset-v1');
  assert.equal(r.controls.speed, 1);
  assert.equal(r.controls.hatching, 2.5);
  assert.equal(r.metadata.hasSourceObject, false);
});

test('instancing key is stable for identical recipe+lod and changes for lod/hash', () => {
  const a = cf.buildRecipe(htmlAsset());
  const b = cf.buildRecipe(htmlAsset());
  assert.equal(cf.instancingKey(a, 'full'), cf.instancingKey(b, 'full'));
  assert.notEqual(cf.instancingKey(a, 'full'), cf.instancingKey(a, 'medium'));
  const c = cf.buildRecipe(htmlAsset({ params: { seed: 'different' } }));
  assert.notEqual(cf.instancingKey(a, 'full'), cf.instancingKey(c, 'full'));
});

test('LOD degrades monotonically with distance', () => {
  const policy = cf.loadPolicy(POLICY);
  const order = policy.tierOrder;
  const distances = [0, 10, 30, 31, 60, 61, 100, 101, 160, 300];
  let prev = -1;
  for (const d of distances) {
    const tier = cf.getLodTier(d, policy);
    const rank = order.indexOf(tier);
    assert.ok(rank >= prev, `${d}m -> ${tier}`);
    prev = rank;
  }
});

test('low tier never ticks; full tier ticks at configured interval', () => {
  const policy = cf.loadPolicy(POLICY);
  assert.equal(cf.shouldTick(1000, 'low', policy), false);
  assert.equal(cf.computeUpdateInterval('low', policy), Infinity);
  assert.equal(cf.shouldTick(0.5, 'full', policy), false);
  assert.equal(cf.shouldTick(1.0, 'full', policy), true);
});

test('planCreatureQuality sleeps invisible creatures', () => {
  const q = cf.planCreatureQuality({ visible: false, distance: 2 }, POLICY);
  assert.equal(q.sleep, true);
  assert.equal(q.animationHz, 0);
  assert.equal(q.useImpostor, true);
});

test('planCreatureQuality never improves farther creatures', () => {
  const policy = cf.loadPolicy(POLICY);
  const order = policy.tierOrder;
  const near = cf.planCreatureQuality({ visible: true, distance: 5, targetFps: 60 }, POLICY);
  const mid = cf.planCreatureQuality({ visible: true, distance: 70, targetFps: 60 }, POLICY);
  const far = cf.planCreatureQuality({ visible: true, distance: 140, targetFps: 60 }, POLICY);
  assert.ok(order.indexOf(near.tier) <= order.indexOf(mid.tier));
  assert.ok(order.indexOf(mid.tier) <= order.indexOf(far.tier));
  assert.ok(near.geometryScale >= mid.geometryScale);
  assert.ok(mid.geometryScale >= far.geometryScale);
});

test('mobile/cpu/frame pressure can only degrade quality', () => {
  const policy = cf.loadPolicy(POLICY);
  const order = policy.tierOrder;
  const base = cf.planCreatureQuality({ visible: true, distance: 20, targetFps: 60 }, POLICY);
  const pressured = cf.planCreatureQuality({ visible: true, distance: 20, targetFps: 60, mobile: true, cpuPressure: 0.9, frameTimeMs: 28 }, POLICY);
  assert.ok(order.indexOf(pressured.tier) >= order.indexOf(base.tier));
  assert.ok(pressured.animationHz <= base.animationHz);
});

test('AnimationScheduler phase-spreads ids without duplicates inside cycle', () => {
  const s = new cf.AnimationScheduler({ maxPerFrame: 3 });
  const ids = ['a','b','c','d','e','f','g'];
  const a = s.schedule(ids);
  const b = s.schedule(ids);
  const c = s.schedule(ids);
  assert.equal(a.length, 3);
  assert.equal(b.length, 3);
  assert.equal(c.length, 1);
  assert.equal(new Set([...a, ...b, ...c]).size, 7);
  assert.deepEqual(s.schedule([]), []);
});

test('LodHysteresis blocks one-frame oscillation and then switches', () => {
  const h = new cf.LodHysteresis({ hysteresisFrames: 2 });
  assert.equal(h.record('x', 'full'), 'full');
  assert.equal(h.record('x', 'high'), 'full');
  assert.equal(h.record('x', 'full'), 'full');
  assert.equal(h.record('x', 'high'), 'full');
  assert.equal(h.record('x', 'high'), 'high');
  assert.equal(h.current('unknown'), undefined);
});

test('legacy creature gameplay API remains available', () => {
  const r1 = cf.seeded('same');
  const r2 = cf.seeded('same');
  assert.equal(r1(), r2());
  assert.equal(cf.creatureId(3, -1, 5), 'c:3:-1:5');
  assert.equal(typeof cf.spawnChunk, 'function');
  assert.equal(typeof cf.tickCreature, 'function');
});
