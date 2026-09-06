'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const contracts = require('../shared/creature-factory-contracts.js');
const factory = require('../shared/creature-factory.js');
const runtime = require('../shared/creature-factory-runtime.js');

test('contract accepts all 13 supported categories', () => {
  for (const category of contracts.VALID_CATEGORIES) {
    const asset = {
      format: 'zero-signal-procedural-asset-v1',
      category,
      name: 'test-' + category,
      params: { seed: 1, scale: 1 },
      object: { type: 'box', size: 1 }
    };
    const r = contracts.validateProceduralAssetV1(asset);
    assert.equal(r.ok, true, category);
  }
});

test('contract rejects unknown category', () => {
  const r = contracts.validateProceduralAssetV1({
    format: 'zero-signal-procedural-asset-v1',
    category: 'unicorn',
    name: 'x',
    params: {},
    object: { type: 'box' }
  });
  assert.equal(r.ok, false);
});

test('contract rejects bad scale and unknown object type', () => {
  assert.equal(contracts.validateProceduralAssetV1({ format: 'zero-signal-procedural-asset-v1', category: 'fish', name: 'x', params: { scale: 0 }, object: { type: 'box' } }).ok, false);
  assert.equal(contracts.validateProceduralAssetV1({ format: 'zero-signal-procedural-asset-v1', category: 'fish', name: 'x', params: { scale: 1 }, object: { type: 'octahedron' } }).ok, false);
});

test('rejects non-assertion green templates (toBeTruthy must be called)', () => {
  assert.equal(typeof contracts.validateProceduralAssetV1, 'function');
  const bad = contracts.validateProceduralAssetV1({ format: 'wrong-format', category: 'fish', name: 'x', params: {}, object: { type: 'box' } });
  assert.equal(bad.ok, false);
  assert.equal(bad.error.includes('format'), true);
});

test('fish category cannot have scale 0 (must be positive)', () => {
  const r = contracts.validateParams({ scale: 0 }, 'fish');
  assert.equal(r.ok, false);
});

test('bipedal categories validate ik/footLocking flags', () => {
  const ok = contracts.validateParams({ scale: 1, ikEnabled: true, footLocking: true }, 'human');
  assert.equal(ok.ok, true);
  const bad = contracts.validateParams({ scale: 1, ikEnabled: 'yes' }, 'human');
  assert.equal(bad.ok, false);
});

test('vehicle hull segments must be >= 3', () => {
  assert.equal(contracts.validateParams({ scale: 1, hullSegments: 8 }, 'ship').ok, true);
  assert.equal(contracts.validateParams({ scale: 1, hullSegments: 2 }, 'ship').ok, false);
});

test('materialSettings validated for rainbow variant', () => {
  const r = contracts.validateMaterialSettings({ albedo: [1, 0, 0], roughness: 0.5, emissive: [1, 1, 0], emissiveIntensity: 1 });
  assert.equal(r.ok, true);
  assert.equal(contracts.validateMaterialSettings({ albedo: [2, 0, 0] }).ok, false);
  assert.equal(contracts.validateMaterialSettings({ roughness: 1.5 }).ok, false);
});

test('generateAsset produces a valid procedural asset with hierarchy', () => {
  const { asset, resolvedMaterial, materialKind } = factory.generateAsset('dragon', { seed: 42, scale: 1.2, detailLevel: 'high' }, { albedo: [0.4, 0.1, 0.05], roughness: 0.4 });
  assert.equal(asset.format, 'zero-signal-procedural-asset-v1');
  assert.equal(asset.category, 'dragon');
  assert.equal(contracts.validateProceduralAssetV1(asset).ok, true);
  assert.equal(asset.object.type, 'group');
  assert.ok(asset.object.children.length > 0);
  assert.deepEqual(resolvedMaterial.albedo, [0.4, 0.1, 0.05]);
  assert.equal(materialKind, 'skin');
});

test('dragon_fire category carries emissive material', () => {
  const { asset, resolvedMaterial } = factory.generateAsset('dragon_fire', { seed: 7 });
  assert.equal(asset.category, 'dragon_fire');
  assert.ok(resolvedMaterial.emissive[0] > 0.5);
  assert.ok(resolvedMaterial.emissiveIntensity > 0.5);
});

test('human sword category produces weapon parts', () => {
  const { asset } = factory.generateAsset('human_sword', { seed: 3 });
  const names = asset.object.children.map(c => c.name);
  assert.ok(names.some(n => n.includes('blade')));
  assert.ok(names.some(n => n.includes('weapon-hand')));
});

test('ship category produces hull with mast', () => {
  const { asset } = factory.generateAsset('ship', { seed: 9, scale: 1.5 });
  const names = asset.object.children.map(c => c.name);
  assert.ok(names.includes('hull'));
  assert.ok(names.includes('mast'));
});

test('steampunk_vehicle category produces wheels and chimney (metal)', () => {
  const { asset, resolvedMaterial } = factory.generateAsset('steampunk_vehicle', { seed: 11, scale: 1.4 });
  const names = asset.object.children.map(c => c.name);
  assert.ok(names.some(n => n.includes('wheel')));
  assert.ok(names.includes('chimney'));
  assert.ok(resolvedMaterial.metalness > 0.3);
});

test('fish category is aquatic with dorsal fin and no legs', () => {
  const { asset } = factory.generateAsset('fish', { seed: 5 });
  const names = asset.object.children.map(c => c.name);
  assert.ok(names.includes('dorsal'));
  assert.ok(!names.some(n => n.startsWith('leg')));
});

test('defaultParams sets sane defaults for a category', () => {
  const p = factory.defaultParams('reptile', {});
  assert.equal(p.kind, 'quadruped');
  assert.equal(p.legs, 4);
  assert.ok(p.hasTail);
  assert.equal(p.scale, 1);
  assert.equal(p.detailLevel, 'mid');
  assert.equal(p.seed, 12345);
});

test('deterministic generation for same seed', () => {
  const a = factory.generateAsset('creature', { seed: 100 });
  const b = factory.generateAsset('creature', { seed: 100 });
  assert.equal(a.asset.object.children.length, b.asset.object.children.length);
  assert.deepEqual(a.asset.object.children.map(c => c.name), b.asset.object.children.map(c => c.name));
});

test('godot asset contract validated with controls', () => {
  const { asset } = factory.generateGodotAsset('human', { seed: 1 }, { type: 'third_person', moveAxis: 'xz', lookMode: 'yaw_pitch' });
  assert.equal(asset.format, 'zero-signal-godot-procedural-asset-v1');
  assert.equal(contracts.validateGodotProceduralAssetV1(asset).ok, true);
});

test('godot asset rejects bad controls', () => {
  const r = contracts.validateGodotProceduralAssetV1({ format: 'zero-signal-godot-procedural-asset-v1', category: 'fish', name: 'x', params: {}, controls: { type: 'fly' } });
  assert.equal(r.ok, false);
});

test('runtime reuses material PBR sampler from WorldProceduralMaterials', () => {
  const sample = runtime.materialSample('skin', 0.3, 0.4, 0);
  assert.equal(sample.albedo.length, 3);
  assert.equal(typeof sample.roughness, 'number');
});

test('runtime lod adapter clamps lodBias into 0.4..1', () => {
  const adapter = runtime.createLodAdapter('dragon', { lodBias: 2, detailLevel: 'ultra' });
  assert.equal(adapter.lodBias, 1);
  const adapterLow = runtime.createLodAdapter('fish', { lodBias: 0.1 });
  assert.equal(adapterLow.lodBias, 0.4);
});

test('material kind picks metal when metalness high', () => {
  assert.equal(factory.materialKindFrom('steampunk_vehicle', { metalness: 0.8 }, null), 'metal');
  assert.equal(factory.materialKindFrom('fish', { metalness: 0 }, null), 'skin');
});

test('all categories generate at least one part and validate', () => {
  for (const category of contracts.VALID_CATEGORIES) {
    const { asset } = factory.generateAsset(category, { seed: 1 });
    assert.ok(asset.object.children.length > 0, category);
    assert.equal(contracts.validateProceduralAssetV1(asset).ok, true, category);
  }
});

test('runtime registers renderer through WorldQualityAutopilot when present', () => {
  const old = globalThis.WorldQualityAutopilot;
  let registered = null;
  globalThis.WorldQualityAutopilot = { registerRenderer: (app, renderer, opts) => { registered = { app, opts }; return true; } };
  const result = runtime.registerRenderer({}, { appId: 'creature-test', options: { tier: 'balanced' } });
  assert.equal(result, true);
  assert.equal(registered.app, 'creature-test');
  globalThis.WorldQualityAutopilot = old;
});
