'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { compileWorldRecipe, evolveWorldRecipe, createRecipeDeltaPacket, applyRecipeDeltaPacket } = require('../lib/world-procedural-recipe-engine');
const core = require('../shared/world-procedural-core');
const { generateStandaloneWorld } = require('../lib/world-procedural-bridge');
const { verifyGoldenVector } = require('../lib/world-procedural-cross-platform');
const { distillNavigatorOutput } = require('../lib/world-procedural-navigator-distiller');
const { detectToolchain } = require('../lib/world-procedural-toolchain');

const root = process.cwd();
const requiredFiles = [
  'shared/world-procedural-core.js',
  'shared/world-procedural-worker.js',
  'lib/world-procedural-recipe-engine.js',
  'lib/world-procedural-budget.js',
  'lib/world-procedural-cache.js',
  'lib/world-procedural-bridge.js',
  'lib/world-procedural-worker-pool.js',
  'lib/world-procedural-chunk-dag.js',
  'lib/world-procedural-visibility.js',
  'lib/world-procedural-audio.js',
  'lib/world-procedural-shader-cache.js',
  'lib/world-procedural-navigator-distiller.js',
  'lib/world-procedural-authority.js',
  'lib/world-procedural-supabase-adapter.js',
  'lib/world-procedural-cross-platform.js',
  'lib/world-procedural-tuner.js',
  'lib/world-procedural-motifs.js',
  'lib/world-procedural-toolchain.js',
  'lib/world-procedural-animation-bridge.js',
  'lib/world-procedural-texture-plan.js',
  'data/world-procedural-policy.json',
  'data/world-procedural-golden-vectors.json',
  'docs/WORLD_PROCEDURAL_RECIPE_ENGINE.md'
];
const reusedSystems = [
  'lib/voxel-rules.js',
  'lib/world-quality-voxel-enhancer.js',
  'lib/world-quality-material-profiler.js',
  'lib/world-quality-pbr-synthesizer.js'
];

function exists(rel) { return fs.existsSync(path.join(root, rel)); }
function readPackage() {
  try { return JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')); }
  catch { return null; }
}

const checks = [];
function check(name, fn, required = true) {
  try { fn(); checks.push({ name, required, status: 'PASS' }); }
  catch (error) { checks.push({ name, required, status: required ? 'FAIL' : 'SKIP', error: String(error?.message || error) }); }
}

for (const file of requiredFiles) check(`required:${file}`, () => assert.ok(exists(file), `missing ${file}`));
for (const file of reusedSystems) check(`reuse:${file}`, () => assert.ok(exists(file), `missing existing integration ${file}`), false);

check('deterministic:compile-hash', () => {
  const input = { worldId: 'audit', seed: 777, style: { detail: 0.8 }, terrain: { amplitude: 9 } };
  const a = compileWorldRecipe(input, { forceTier: 'medium' });
  const b = compileWorldRecipe(input, { forceTier: 'medium' });
  assert.equal(a.contentHash, b.contentHash);
});

check('deterministic:chunk', () => {
  const recipe = { worldId: 'audit', seed: 123, terrain: { amplitude: 5 }, architecture: { kind: 'ruins', density: 1 } };
  const a = core.generateVoxelChunk(recipe, 2, -3, { maxVoxels: 5000 });
  const b = core.generateVoxelChunk(recipe, 2, -3, { maxVoxels: 5000 });
  assert.deepEqual(a.voxels, b.voxels);
  assert.ok(a.voxels.length > 0);
});

check('transport:delta-roundtrip', () => {
  const a = compileWorldRecipe({ worldId: 'audit', seed: 9 });
  const b = evolveWorldRecipe(a.recipe, { atmosphere: { fog: 0.81 }, style: { detail: 0.93 } });
  const packet = createRecipeDeltaPacket(a, b);
  const restored = applyRecipeDeltaPacket(a, packet);
  assert.equal(restored.contentHash, b.contentHash);
});

check('bridge:standalone-world', () => {
  const world = generateStandaloneWorld({ worldId: 'audit', seed: 41, architecture: { kind: 'tower', density: 1 } }, { forceTier: 'low' }, { enhanceExisting: false });
  assert.ok(Array.isArray(world.voxels) && world.voxels.length > 0);
  assert.equal(world.proceduralRecipe.worldId, 'audit');
  assert.ok(world.proceduralAudioPlan?.voices?.length > 0);
  assert.ok(Array.isArray(world.proceduralFrameTimeline?.tracks));
  assert.ok(world.proceduralTextureRecipe?.contentHash);
});

check('navigator:ru-gothic-regression', () => {
  const patch = distillNavigatorOutput({ message: 'Темный готический город в тумане' });
  assert.equal(patch.architecture.kind, 'gothic');
  assert.ok(patch.atmosphere.fog > 0.5);
});

check('cross-platform:golden-vectors', () => {
  const file = path.join(root, 'data', 'world-procedural-golden-vectors.json');
  const vectors = JSON.parse(fs.readFileSync(file, 'utf8')).vectors;
  assert.ok(vectors.length >= 3);
  for (const vector of vectors) assert.equal(verifyGoldenVector(vector).ok, true);
});

check('package:scripts', () => {
  const pkg = readPackage();
  assert.ok(pkg?.scripts?.['world:recipe:test']);
  assert.ok(pkg?.scripts?.['world:recipe:audit']);
  assert.ok(pkg?.scripts?.['world:recipe:vectors']);
  assert.ok(pkg?.scripts?.['world:recipe:size']);
  assert.ok(pkg?.scripts?.['world:recipe:verify']);
  assert.ok(String(pkg?.scripts?.['release:gate'] || '').includes('world:recipe:verify'));
});

const tools = detectToolchain(root);
const optionalTools = [
  ['FastNoiseLite', tools.fastNoiseLite],
  ['meshoptimizer', tools.meshoptimizer],
  ['gltfpack', tools.gltfpack],
  ['basis_universal', tools.basisUniversal],
  ['KTX-Software', tools.ktxSoftware],
  ['zstd', tools.zstd],
  ['zstd-bin', tools.zstdBin]
].map(([name, value]) => ({ name, path: value, installed: Boolean(value) }));

const requiredFailures = checks.filter((item) => item.required && item.status !== 'PASS');
const report = {
  schemaVersion: '2.0.0',
  system: 'WORLD_PROCEDURAL_RECIPE_ENGINE',
  engineVersion: core.ENGINE_VERSION,
  status: requiredFailures.length ? 'FAIL' : 'PASS',
  checks,
  optionalTools,
  summary: {
    pass: checks.filter((item) => item.status === 'PASS').length,
    fail: checks.filter((item) => item.status === 'FAIL').length,
    skip: checks.filter((item) => item.status === 'SKIP').length,
    requiredFail: requiredFailures.length,
    optionalToolsInstalled: optionalTools.filter((item) => item.installed).length
  }
};

if (process.argv.includes('--write')) fs.writeFileSync(path.join(root, 'WORLD_PROCEDURAL_RECIPE_AUDIT.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
if (requiredFailures.length) process.exitCode = 1;
