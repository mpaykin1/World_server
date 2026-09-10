'use strict';

const assert = require('node:assert/strict');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const {
  compileRegistry,
  importArmorPaintFolder,
  loadPolicy,
  readImageDimensions,
  sha256,
  stableStringify,
  validateManifest
} = require('../lib/material-forge');

const ROOT = path.resolve(__dirname, '..');
const read = relative => fs.readFileSync(path.join(ROOT, relative), 'utf8');

function pngHeader(width, height) {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

function armorPaintManifest(overrides = {}) {
  const variant = { uri: '/shared/materials/gothic-stone/gothic-stone_basecolor.png', width: 1024, height: 1024, bytes: 1024, sha256: 'a'.repeat(64) };
  return {
    schemaVersion: '1.0.0', id: 'gothic-stone', displayName: 'Gothic Stone',
    source: { tool: 'ArmorPaint', author: 'World Server artist', license: 'project-owned', projectFile: 'gothic-stone.arm' },
    materialClass: 'stone', mapping: 'triplanar', match: { semantics: ['stone', 'brick'], worlds: ['voxel-world'] },
    parameters: { roughness: .84, metalness: .02, normalStrength: .6, aoStrength: .75, emissiveIntensity: 0, tilingScale: 4, blend: 1 },
    maps: { baseColor: [variant], normal: [{ ...variant, uri: '/shared/materials/gothic-stone/gothic-stone_normal.png' }] }, priority: 100,
    ...overrides
  };
}

test('canonical Material Forge registry compiles deterministically', () => {
  const first = compileRegistry({ root: ROOT, verifyFiles: true });
  const second = compileRegistry({ root: ROOT, verifyFiles: true });
  assert.equal(first.ok, true, first.errors.join('\n'));
  assert.equal(Object.keys(first.registry.materials).length, 6);
  assert.equal(stableStringify(first.registry), stableStringify(second.registry));
  assert.equal(read('shared/material-forge-registry.json'), stableStringify(first.registry));
  assert.ok(first.registry.policy.guards.runtime16kForbidden);
});

test('ArmorPaint manifests require provenance and useful PBR evidence', () => {
  const valid = validateManifest(armorPaintManifest(), { root: ROOT, verifyFiles: false });
  assert.equal(valid.ok, true, valid.errors.join('\n'));
  const noProject = armorPaintManifest({ source: { tool: 'ArmorPaint', author: 'artist', license: 'project-owned' } });
  assert.ok(validateManifest(noProject, { root: ROOT, verifyFiles: false }).errors.some(error => error.includes('.arm')));
  const noPbr = armorPaintManifest({ maps: { baseColor: armorPaintManifest().maps.baseColor } });
  assert.ok(validateManifest(noPbr, { root: ROOT, verifyFiles: false }).errors.some(error => error.includes('normal or ORM')));
});

test('unsafe, remote, oversized and 16K runtime maps fail closed', () => {
  const cases = [
    armorPaintManifest({ maps: { ...armorPaintManifest().maps, baseColor: [{ ...armorPaintManifest().maps.baseColor[0], uri: 'https://example.com/texture.png' }] } }),
    armorPaintManifest({ maps: { ...armorPaintManifest().maps, baseColor: [{ ...armorPaintManifest().maps.baseColor[0], uri: '/shared/materials/gothic-stone/../secret.png' }] } }),
    armorPaintManifest({ maps: { ...armorPaintManifest().maps, baseColor: [{ ...armorPaintManifest().maps.baseColor[0], width: 16384, height: 16384 }] } }),
    armorPaintManifest({ maps: { ...armorPaintManifest().maps, baseColor: [{ ...armorPaintManifest().maps.baseColor[0], bytes: 99999999 }] } })
  ];
  for (const manifest of cases) assert.equal(validateManifest(manifest, { root: ROOT, verifyFiles: false }).ok, false);
});

test('ArmorPaint folder importer hashes maps and records exact dimensions', t => {
  const temporaryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'world-material-forge-'));
  t.after(() => fs.rmSync(temporaryRoot, { recursive: true, force: true }));
  const directory = path.join(temporaryRoot, 'shared', 'materials', 'test-stone');
  fs.mkdirSync(directory, { recursive: true });
  const base = pngHeader(512, 512), orm = pngHeader(512, 512);
  fs.writeFileSync(path.join(directory, 'test-stone_basecolor_SAFE.png'), base);
  fs.writeFileSync(path.join(directory, 'test-stone_orm_SAFE.png'), orm);
  const policy = loadPolicy(ROOT);
  const manifest = importArmorPaintFolder({
    root: temporaryRoot, policy, sourceDirectory: 'shared/materials/test-stone', id: 'test-stone', displayName: 'Test Stone',
    materialClass: 'stone', author: 'Test Artist', license: 'project-owned', projectFile: 'test-stone.arm'
  });
  assert.equal(manifest.source.tool, 'ArmorPaint');
  assert.equal(manifest.maps.baseColor[0].width, 512);
  assert.equal(manifest.maps.baseColor[0].sha256, sha256(base));
  assert.equal(manifest.maps.orm[0].tier, 'SAFE');
  assert.deepEqual(readImageDimensions(base, '.png'), { width: 512, height: 512, format: 'png' });
});

test('browser runtime is syntax-valid and every compatible production Three.js world adopts one bootstrap', () => {
  for (const file of ['shared/graphics/material-forge-runtime.js', 'shared/graphics/universal-voxel-microdetail-bootstrap.js']) {
    const result = childProcess.spawnSync(process.execPath, ['--check', '--input-type=module'], { input: read(file), encoding: 'utf8' });
    assert.equal(result.status, 0, `${file}: ${result.stderr || result.stdout}`);
  }
  const bootstrap = '/shared/graphics/universal-voxel-microdetail-bootstrap.js';
  for (const app of ['voxel-world', 'ai3d-voxel-city', 'survival', 'catalog', 'world-sharabass']) assert.ok(read(`apps/${app}/index.html`).includes(bootstrap), app);
  const runtime = read('shared/graphics/material-forge-runtime.js');
  for (const token of ['selectMapPlan', 'runtime16k', 'setTextureBudgetScale', 'triplanarBind', 'proceduralFallbacks']) {
    if (token === 'runtime16k') assert.ok(read('data/material-forge/policy.json').includes(token));
    else assert.ok(runtime.includes(token), token);
  }
});

test('browser runtime selects tier-bounded maps and applies procedural fallback without a browser', async () => {
  const source = read('shared/graphics/material-forge-runtime.js');
  const runtimeModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const registry = JSON.parse(read('shared/material-forge-registry.json'));
  const recipe = armorPaintManifest({
    maps: {
      baseColor: [
        { uri: '/shared/materials/gothic-stone/base_SAFE.png', width: 512, height: 512, bytes: 100, sha256: 'a'.repeat(64), tier: 'SAFE' },
        { uri: '/shared/materials/gothic-stone/base_HIGH.png', width: 2048, height: 2048, bytes: 1000, sha256: 'b'.repeat(64), tier: 'HIGH' },
        { uri: '/shared/materials/gothic-stone/base_16k.png', width: 16384, height: 16384, bytes: 1000, sha256: 'c'.repeat(64), tier: 'ULTRA' }
      ],
      normal: [{ uri: '/shared/materials/gothic-stone/normal_HIGH.png', width: 2048, height: 2048, bytes: 1000, sha256: 'd'.repeat(64), tier: 'HIGH' }],
      orm: [{ uri: '/shared/materials/gothic-stone/orm_HIGH.png', width: 2048, height: 2048, bytes: 1000, sha256: 'e'.repeat(64), tier: 'HIGH' }]
    }
  });
  const testRegistry = { ...registry, materials: { ...registry.materials, 'gothic-stone': recipe } };
  const safePlan = runtimeModule.selectMapPlan(testRegistry, recipe, 'SAFE');
  assert.deepEqual(Object.keys(safePlan), ['baseColor']);
  assert.equal(safePlan.baseColor.width, 512);
  const highPlan = runtimeModule.selectMapPlan(testRegistry, recipe, 'HIGH');
  assert.equal(highPlan.baseColor.width, 2048);
  assert.deepEqual(Object.keys(highPlan), ['baseColor', 'orm', 'normal']);
  assert.notEqual(highPlan.baseColor.width, 16384);
  assert.equal(runtimeModule.selectMaterialRecipe(testRegistry, { id: 'gothic-stone', worldId: 'wrong-world' }), null);

  class TextureLoader { load(uri, done) { done({ image: { width: 512, height: 512 }, userData: {}, dispose() {} }); } }
  const THREE = { TextureLoader, RepeatWrapping: 1000, SRGBColorSpace: 'srgb' };
  const material = { isMeshStandardMaterial: true, transparent: false, opacity: 1, roughness: .95, metalness: 0, emissiveIntensity: 1, userData: {}, needsUpdate: false };
  const runtime = runtimeModule.createMaterialForgeRuntime({ THREE, registry, initialTier: 'SAFE', worldId: 'voxel-world' });
  runtime.enhanceMaterial(material, 'stone', { geometry: { getAttribute() { return null; } }, userData: {} }, { id: 'world-stone' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(material.userData.materialForge.recipeId, 'world-stone');
  assert.equal(material.userData.materialForge.authoredMaps, false);
  assert.ok(material.roughness < .95 && material.roughness > .86);
  assert.equal(runtime.stats().proceduralFallbacks, 1);
  runtime.enhanceMaterial(material, 'stone');
  assert.equal(runtime.stats().proceduralFallbacks, 1);

  const implicitMaterial = { isMeshStandardMaterial: true, transparent: false, opacity: 1, roughness: .95, metalness: 0, emissiveIntensity: 1, userData: {}, needsUpdate: false };
  runtime.enhanceMaterial(implicitMaterial, 'stone');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(implicitMaterial.userData.materialForge.recipeId, 'world-stone');
  assert.equal(implicitMaterial.roughness, .95, 'implicit procedural fallback must not change approved visuals');
  assert.equal(implicitMaterial.metalness, 0, 'implicit procedural fallback must preserve scalar PBR values');
});

test('browser runtime rejects tampered paths and fully removes triplanar binding after tier downgrade', async () => {
  const source = read('shared/graphics/material-forge-runtime.js');
  const runtimeModule = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  const registry = JSON.parse(read('shared/material-forge-registry.json'));
  const baseVariant = { uri: '/shared/materials/gothic-stone/base_HIGH.png', width: 2048, height: 2048, bytes: 1000, sha256: 'a'.repeat(64), tier: 'HIGH' };
  const recipe = armorPaintManifest({ maps: { baseColor: [baseVariant], normal: [{ ...baseVariant, uri: '/shared/materials/gothic-stone/normal_HIGH.png' }] } });
  const testRegistry = { ...registry, materials: { 'gothic-stone': recipe } };
  let loads = 0;
  class TextureLoader { load(uri, done) { loads += 1; done({ image: { width: 2048, height: 2048 }, userData: {}, dispose() {} }); } }
  const THREE = { TextureLoader, RepeatWrapping: 1000, SRGBColorSpace: 'srgb' };
  const originalCompile = () => {};
  const originalKey = () => 'original-key';
  const material = { isMeshStandardMaterial: true, transparent: false, opacity: 1, roughness: .9, metalness: 0, emissiveIntensity: 1, userData: {}, onBeforeCompile: originalCompile, customProgramCacheKey: originalKey, needsUpdate: false };
  const runtime = runtimeModule.createMaterialForgeRuntime({ THREE, registry: testRegistry, initialTier: 'HIGH', worldId: 'voxel-world' });
  runtime.enhanceMaterial(material, 'stone', { geometry: { getAttribute() { return null; } }, userData: {} }, { id: 'gothic-stone' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 2);
  assert.notEqual(material.onBeforeCompile, originalCompile);
  runtime.setTier('SAFE');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(material.onBeforeCompile, originalCompile);
  assert.equal(material.customProgramCacheKey, originalKey);
  assert.equal(material.userData.materialForge.authoredMaps, false);

  const unsafeRecipe = armorPaintManifest({ maps: { baseColor: [{ ...baseVariant, uri: '/shared/materials/gothic-stone/../escape.png' }], normal: recipe.maps.normal } });
  const unsafeRegistry = { ...registry, materials: { 'gothic-stone': unsafeRecipe } };
  loads = 0;
  const unsafeMaterial = { isMeshStandardMaterial: true, transparent: false, opacity: 1, roughness: .9, metalness: 0, emissiveIntensity: 1, userData: {}, needsUpdate: false };
  const unsafeRuntime = runtimeModule.createMaterialForgeRuntime({ THREE, registry: unsafeRegistry, initialTier: 'HIGH', worldId: 'voxel-world' });
  unsafeRuntime.enhanceMaterial(unsafeMaterial, 'stone', { geometry: { getAttribute() { return true; } }, userData: {} }, { id: 'gothic-stone' });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(loads, 1, 'only the safe normal request may reach TextureLoader');
  assert.match(unsafeMaterial.userData.materialForge.lastError, /unsafe Material Forge texture uri/);
});

test('ArmorPaint export preset keeps OpenGL normal and RGB ORM packing', () => {
  const preset = JSON.parse(read('data/material-forge/armorpaint-world-server.json'));
  const byName = Object.fromEntries(preset.textures.map(texture => [texture.name, texture]));
  assert.deepEqual(byName.normal.channels, ['nor_r', 'nor_g', 'nor_b', '1.0']);
  assert.deepEqual(byName.orm.channels, ['occ', 'rough', 'metal', '1.0']);
});

test('fresh agents can discover the canonical Material Forge contract', () => {
  const index = JSON.parse(read('.ai/project-context-index.json'));
  assert.equal(index.concepts.materialForge.canonicalFile, 'docs/ARMORPAINT_MATERIAL_FORGE.md');
  assert.ok(index.concepts.materialForge.aliases.includes('ArmorPaint'));
  assert.ok(read('AI_START_HERE.md').includes('docs/ARMORPAINT_MATERIAL_FORGE.md'));
});
