'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeSeedKey, seed32FromKey, createArchitectureDNA,
  sampleCityPlan, sampleBuildingRecipe, huntArchitectureSeeds
} = require('../lib/architecture-seeds');
const { createWorldDNA, settingsFromDNA, publicWorld } = require('../lib/world-factory');
const factoryApi = require('../lib/api-handlers/world-factory')._private;

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


test('World Factory preserves exact explicit seedKey and exposes architecture DNA', () => {
  const raw = '-3361685360695458093';
  const dna = createWorldDNA({
    idea: 'готический затопленный город в джунглях',
    requestId: '123e4567-e89b-42d3-a456-426614174999',
    loreBible: { worlds: {} },
    seed: raw
  });
  assert.equal(dna.seedKey, raw);
  assert.equal(dna.architecture.primaryFamily, 'gothic');
  assert.ok(Number.isSafeInteger(dna.seed) && dna.seed > 0);
  const settings = settingsFromDNA(dna);
  assert.equal(settings.seedKey, raw);
  const world = publicWorld({ id: dna.id, seed: dna.seed, settings });
  assert.equal(world.seedKey, raw);
  assert.deepEqual(world.architecture, dna.architecture);
});


test('World Factory seed preview returns deterministic building samples without persistence', () => {
  const body = { seed: '350362654', idea: 'Tokyo flooded ruins', samples: [{ x: 10, z: 20 }] };
  const a = factoryApi.previewArchitectureSeed(body);
  const b = factoryApi.previewArchitectureSeed(body);
  assert.deepEqual(a, b);
  assert.equal(a.architecture.primaryFamily, 'tokyo');
  assert.equal(a.samples.length, 1);
});

test('World Factory seed hunter API is bounded and deterministic', () => {
  const body = { startSeed: '500', count: 32, limit: 5, idea: 'future jungle city', criteria: { family: 'future', modifiers: ['jungle'] } };
  const a = factoryApi.huntArchitectureSeedOptions(body);
  const b = factoryApi.huntArchitectureSeedOptions(body);
  assert.deepEqual(a, b);
  assert.equal(a.seeds.length, 5);
});


test('facade constraint collapse is deterministic and keeps accent modules separated', () => {
  const dna = createArchitectureDNA({ seed: '777', idea: 'готический город' });
  const recipe = sampleBuildingRecipe(dna, { x: 16, z: 32, lotWidth: 16, lotDepth: 18 });
  const pattern = recipe.facadePattern;
  assert.ok(pattern.width >= 3 && pattern.height >= 2);
  assert.deepEqual(pattern, sampleBuildingRecipe(dna, { x: 16, z: 32, lotWidth: 16, lotDepth: 18 }).facadePattern);
  const accent = dna.grammar.facade.at(-1);
  const center = Math.floor(pattern.width / 2);
  assert.equal(pattern.rows[pattern.height - 1][center], accent);
  for (let y = 0; y < pattern.height; y++) for (let x = 0; x < pattern.width; x++) {
    if (pattern.rows[y][x] !== accent) continue;
    if (x + 1 < pattern.width) assert.notEqual(pattern.rows[y][x + 1], accent);
    if (y + 1 < pattern.height) assert.notEqual(pattern.rows[y + 1][x], accent);
  }
});


test('city plans are deterministic and architecture-specific', () => {
  const ny = createArchitectureDNA({ seed: '9001', idea: 'New York' });
  const china = createArchitectureDNA({ seed: '9001', idea: 'древняя китайская архитектура' });
  const a = sampleCityPlan(ny, { x: 0, z: 0, size: 240 });
  const b = sampleCityPlan(ny, { x: 0, z: 0, size: 240 });
  const c = sampleCityPlan(china, { x: 0, z: 0, size: 240 });
  assert.deepEqual(a, b);
  assert.ok(a.roads.length > 4 && c.roads.length > 2);
  assert.notEqual(a.pattern, c.pattern);
  assert.equal(a.districtAnchors.length, 4);
});


test('Minecraft seed bridge binds every architecture family to a valid 13-slot block palette', () => {
  const atlas = require('../assets/voxel/prokopiy-minecraft/blocks/blocks_atlas.json');
  for (const idea of ['gothic city','New York','древняя китайская архитектура','Tokyo','future city']) {
    const dna = createArchitectureDNA({ seed: '424242424242424242', idea });
    assert.equal(dna.minecraft.provider, 'prokopiy-minecraft');
    assert.equal(dna.minecraft.blockAtlas.palette.length, 13);
    assert.ok(dna.minecraft.blockAtlas.palette.every(entry => atlas.textures[entry.name]?.[0] === entry.index));
    assert.ok(dna.minecraft.assets.mobs.length >= 1);
    assert.ok(dna.minecraft.structures.pool.length >= 5);
  }
});

test('Minecraft palettes and asset packs remain deterministic but architecture-specific', () => {
  const gothicA = createArchitectureDNA({ seed: '7777', idea: 'gothic jungle ruins' });
  const gothicB = createArchitectureDNA({ seed: '7777', idea: 'gothic jungle ruins' });
  const tokyo = createArchitectureDNA({ seed: '7777', idea: 'Tokyo jungle ruins' });
  assert.deepEqual(gothicA.minecraft, gothicB.minecraft);
  assert.notDeepEqual(
    gothicA.minecraft.blockAtlas.palette.map(x => x.name),
    tokyo.minecraft.blockAtlas.palette.map(x => x.name)
  );
  assert.ok(gothicA.minecraft.structures.pool.includes('jungle_shrine'));
  assert.ok(gothicA.minecraft.structures.pool.includes('collapsed_tower'));
});

test('seeded building recipes can carry deterministic Minecraft-derived rare structures', () => {
  const dna = createArchitectureDNA({ seed: '123456789', idea: 'future flooded ruins' });
  let found = null;
  for (let x = 0; x < 512 && !found; x += 18) for (let z = 0; z < 512 && !found; z += 18) {
    found = sampleBuildingRecipe(dna, { x, z, lotWidth: 16, lotDepth: 16 }).minecraftStructure;
  }
  assert.ok(found);
  assert.ok(dna.minecraft.structures.pool.includes(found.type));
  assert.ok([0,90,180,270].includes(found.rotation));
});

test('voxel client loads the Minecraft seeded palette runtime without replacing the mesher', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.resolve(__dirname, '..');
  const html = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'index.html'), 'utf8');
  const client = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'client.js'), 'utf8');
  const runtime = fs.readFileSync(path.join(root, 'shared', 'minecraft-seed-palette-runtime.js'), 'utf8');
  assert.match(html, /minecraft-seed-palette-runtime\.js/);
  assert.match(client, /applyMinecraftSeedPalette/);
  assert.match(client, /MinecraftSeedPaletteRuntime/);
  assert.match(runtime, /blockAtlas\?\.palette/);
  assert.match(runtime, /drawImage/);
  assert.match(client, /function rebuildChunk/);
});

test('preview-seed stays independent from Supabase initialization', async () => {
  const { Readable } = require('node:stream');
  const handler = require('../lib/api-handlers/world-factory');
  const req = Readable.from([JSON.stringify({ action:'preview-seed', seed:'350362654', idea:'Tokyo flooded ruins' })]);
  req.method = 'POST'; req.url = '/api/world-factory'; req.headers = { 'content-type':'application/json' };
  let status = 0, payload = '';
  const res = {
    setHeader(){},
    writeHead(code){ status = code; },
    end(chunk=''){ payload += chunk || ''; }
  };
  await handler(req, res);
  assert.equal(status, 200);
  const body = JSON.parse(payload);
  assert.equal(body.architecture.seedKey, '350362654');
  assert.equal(body.architecture.primaryFamily, 'tokyo');
  assert.equal(body.architecture.minecraft.blockAtlas.palette.length, 13);
});
