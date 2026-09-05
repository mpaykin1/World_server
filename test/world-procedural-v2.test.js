'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');
const { compileWorldRecipe, evolveWorldRecipe } = require('../lib/world-procedural-recipe-engine');
const { IncrementalChunkDag, invalidationClassesFromDelta } = require('../lib/world-procedural-chunk-dag');
const { lodForDistance, planVisibility } = require('../lib/world-procedural-visibility');
const { buildAudioPlan, synthesizeWav } = require('../lib/world-procedural-audio');
const { compileShaderPermutation, ShaderPermutationCache } = require('../lib/world-procedural-shader-cache');
const { distillNavigatorOutput, mutateFromNavigator } = require('../lib/world-procedural-navigator-distiller');
const { MemoryAuthorityAdapter, RecipeAuthority } = require('../lib/world-procedural-authority');
const { makeGoldenVector, verifyGoldenVector } = require('../lib/world-procedural-cross-platform');
const { ProceduralWorkerPool } = require('../lib/world-procedural-worker-pool');
const { paretoFront, generateCandidates } = require('../lib/world-procedural-tuner');
const { MOTIFS, applyMotif } = require('../lib/world-procedural-motifs');
const { detectToolchain } = require('../lib/world-procedural-toolchain');
const { buildFrameTimeline, installIntoTimelineRuntime } = require('../lib/world-procedural-animation-bridge');
const { buildTextureRecipe, makeTextureBakeJobs } = require('../lib/world-procedural-texture-plan');

function hash(buffer) { return crypto.createHash('sha256').update(buffer).digest('hex'); }

test('incremental DAG invalidates only relevant artifact classes', () => {
  const c = invalidationClassesFromDelta({ atmosphere: { fog: 0.8 }, performance: { targetFps: 60 } });
  assert.ok(c.classes.includes('visibility'));
  assert.ok(c.classes.includes('shader'));
  assert.equal(c.classes.includes('geometry'), false);
  const dag = new IncrementalChunkDag();
  dag.registerChunks([[0, 0], [1, 0], [10, 10]]);
  const a = compileWorldRecipe({ worldId: 'dag', seed: 4 });
  const b = evolveWorldRecipe(a.recipe, { terrain: { amplitude: 22 } });
  const result = dag.invalidateRecipeChange(a.recipe, b.recipe, { center: { x: 0, z: 0 }, localRadius: 1 });
  assert.ok(result.classes.includes('geometry'));
  assert.deepEqual(new Set(result.affectedChunks), new Set(['0,0', '1,0']));
});

test('visibility planner assigns HLOD and respects budget', () => {
  assert.equal(lodForDistance(1, 16, 1), 0);
  assert.ok(lodForDistance(500, 16, 1) >= 2);
  const chunks = Array.from({ length: 20 }, (_, i) => ({ x: i - 10, z: 0 }));
  const plan = planVisibility(chunks, { x: 0, z: 0 }, { maxVisibleChunks: 5, chunkRadius: 3 }, { farDistance: 1000 });
  assert.equal(plan.visible.length, 5);
  assert.ok(plan.visible[0].distance <= plan.visible[4].distance);
});

test('procedural audio plan and PCM are deterministic', () => {
  const recipe = { worldId: 'sound', seed: 555, audio: { intensity: 0.6 }, atmosphere: { wind: 0.4 } };
  assert.deepEqual(buildAudioPlan(recipe), buildAudioPlan(recipe));
  const a = synthesizeWav(recipe, { sampleRate: 8000, durationSeconds: 0.1 }).buffer;
  const b = synthesizeWav(recipe, { sampleRate: 8000, durationSeconds: 0.1 }).buffer;
  assert.equal(hash(a), hash(b));
  assert.equal(a.subarray(0, 4).toString(), 'RIFF');
});

test('shader permutation cache compiles stable feature defines', () => {
  const template = '/*__WORLD_DEFINES__*/\nvoid main(){}';
  const a = compileShaderPermutation(template, { shaderId: 'pbr', features: { wetness: 1, fog: true } });
  const b = compileShaderPermutation(template, { shaderId: 'pbr', features: { fog: true, wetness: 1 } });
  assert.equal(a.key, b.key);
  assert.match(a.source, /#define FOG 1/);
  const cache = new ShaderPermutationCache();
  assert.equal(cache.getOrCompile(template, { shaderId: 'pbr', features: { fog: true, wetness: 1 } }).key, a.key);
});

test('Navigator distillation yields validated compact patches without retaining raw text', () => {
  const patch = distillNavigatorOutput({ message: 'Темный готический город, туман, мокрый камень и больше деталей' });
  assert.equal(patch.architecture.kind, 'gothic');
  assert.ok(patch.atmosphere.fog > 0.5);
  const previous = compileWorldRecipe({ worldId: 'nav', seed: 10 });
  const next = mutateFromNavigator(previous.recipe, { message: 'Темный готический город, туман' });
  assert.equal(JSON.stringify(next.recipe).includes('готический'), false);
  assert.equal(next.recipe.source.navigatorTurn, 1);
});

test('recipe authority uses optimistic concurrency to prevent split-brain worlds', async () => {
  const authority = new RecipeAuthority(new MemoryAuthorityAdapter());
  const a = compileWorldRecipe({ worldId: 'shared', seed: 1 });
  await authority.initialize(a.recipe);
  const b = evolveWorldRecipe(a.recipe, { atmosphere: { fog: 0.7 } });
  const committed = await authority.commit(a, b);
  assert.equal(committed.snapshot.contentHash, b.contentHash);
  const c = evolveWorldRecipe(a.recipe, { atmosphere: { fog: 0.2 } });
  await assert.rejects(() => authority.commit(a, c), /compare-and-swap conflict/);
});

test('cross-platform golden vectors detect deterministic divergence', () => {
  const vector = makeGoldenVector({ worldId: 'golden', seed: 1001, architecture: { kind: 'gothic', density: 0.7 } }, [[0, 0], [1, -1]]);
  assert.equal(verifyGoldenVector(vector).ok, true);
  const broken = structuredClone(vector);
  broken.chunks[0].signature = '0'.repeat(64);
  assert.equal(verifyGoldenVector(broken).ok, false);
});

test('worker_threads generation matches deterministic synchronous output', async () => {
  const pool = new ProceduralWorkerPool({ size: 1 });
  try {
    const vector = makeGoldenVector({ worldId: 'worker', seed: 31337 }, [[2, 3]]);
    const chunk = await pool.generateChunk(vector.recipe, 2, 3, { chunkSize: 16, surfaceDepth: 3, maxVoxels: 12000 });
    const { chunkSignature } = require('../lib/world-procedural-cross-platform');
    assert.equal(chunkSignature(chunk), vector.chunks[0].signature);
  } finally { await pool.close(); }
});

test('quality tuner generates deterministic candidates and Pareto selection', () => {
  const a = generateCandidates({ worldId: 'tune', seed: 9 }, { count: 6 });
  const b = generateCandidates({ worldId: 'tune', seed: 9 }, { count: 6 });
  assert.deepEqual(a, b);
  const front = paretoFront([
    { metrics: { quality: 90, fps: 60, bytes: 100 } },
    { metrics: { quality: 80, fps: 50, bytes: 120 } },
    { metrics: { quality: 92, fps: 50, bytes: 80 } }
  ]);
  assert.equal(front.length, 2);
});

test('motif layer reuses compact recipes instead of duplicated assets', () => {
  assert.ok(MOTIFS['wet-gothic-night']);
  const recipe = applyMotif({ worldId: 'motif', seed: 5 }, 'wet-gothic-night');
  assert.equal(recipe.architecture.kind, 'gothic');
  assert.ok(recipe.style.wetness > 0.8);
});

test('optional toolchain detection never makes runtime fallback mandatory', () => {
  const tools = detectToolchain(process.cwd());
  assert.equal(typeof tools, 'object');
  assert.ok(Object.hasOwn(tools, 'gltfpack'));
});


test('frame-timeline bridge produces deterministic reusable tracks', () => {
  const a = buildFrameTimeline({ worldId: 'anim', seed: 14, animation: { ambientMotion: 0.7 }, atmosphere: { wind: 0.5 } });
  const b = buildFrameTimeline({ worldId: 'anim', seed: 14, animation: { ambientMotion: 0.7 }, atmosphere: { wind: 0.5 } });
  assert.deepEqual(a, b);
  const registered = [];
  const result = installIntoTimelineRuntime({ registerTrack: (track) => registered.push(track) }, a);
  assert.equal(result.installed, a.tracks.length);
  assert.deepEqual(registered, a.tracks);
});

test('procedural texture recipe yields compact KTX2 bake jobs', () => {
  const a = buildTextureRecipe({ worldId: 'tex', seed: 21, style: { wetness: 0.8, detail: 0.9 } });
  const b = buildTextureRecipe({ worldId: 'tex', seed: 21, style: { wetness: 0.8, detail: 0.9 } });
  assert.equal(a.contentHash, b.contentHash);
  const jobs = makeTextureBakeJobs({ worldId: 'tex', seed: 21 }, { formats: ['ktx2'] });
  assert.equal(jobs[0].format, 'ktx2');
});
