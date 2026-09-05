'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const core = require('../shared/world-procedural-core');
const { compileWorldRecipe } = require('../lib/world-procedural-recipe-engine');
const { grammarKind, compileRegionPlan, generateVoxelChunkWithGrammar } = require('../lib/world-procedural-grammar');
const { encodeSparseVoxelDag, decodeSparseVoxelDag, verifyRoundTrip } = require('../lib/world-procedural-sparse-voxel');
const { buildMeshletsFromChunk, buildGpuVisibilityPlan, HZB_CULL_WGSL, createWebGpuCuller } = require('../lib/world-procedural-gpu-visibility');
const { buildAudioWorkletModuleSource, installProceduralAudio, PROCESSOR_NAME } = require('../lib/world-procedural-audio-runtime');
const { scoreMetrics, promotionEligible, selectPromotionCandidate, runTelemetryTournament } = require('../lib/world-procedural-telemetry-tournament');
const { portableChunkSignature, makeNativeContractReport, compareNativeReports } = require('../lib/world-procedural-native-contract');
const { makeGoldenVector, verifyGoldenVector } = require('../lib/world-procedural-cross-platform');
const { createLiveSupabaseProceduralAdapter } = require('../lib/world-procedural-live-supabase');
const { DistributedChunkCache } = require('../lib/world-procedural-distributed-cache');
const { createNavigatorRecipeCommitter, defaultIdempotencyKey } = require('../lib/world-procedural-navigator-commit');
const { ProceduralWorkerPool } = require('../lib/world-procedural-worker-pool');

function canonical(voxels) {
  return (voxels || []).map((v) => v.slice(0, 4)).sort((a, b) => a[0]-b[0] || a[2]-b[2] || a[1]-b[1] || a[3]-b[3]);
}

test('biome/architecture grammar is deterministic and adds bounded gothic structure', () => {
  const recipe = core.normalizeRecipe({ worldId: 'grammar', seed: 123, terrain: { kind: 'city' }, architecture: { kind: 'gothic', density: 0.8, verticality: 0.9 } });
  assert.equal(grammarKind(recipe), 'gothic-city');
  const a = compileRegionPlan(recipe, 0, 0);
  const b = compileRegionPlan(recipe, 0, 0);
  assert.deepEqual(a, b);
  assert.ok(a.placements.length > 10);
  const chunkA = generateVoxelChunkWithGrammar(recipe, 0, 0, { maxVoxels: 20000 });
  const chunkB = generateVoxelChunkWithGrammar(recipe, 0, 0, { maxVoxels: 20000 });
  assert.deepEqual(chunkA.voxels, chunkB.voxels);
  assert.ok(chunkA.stats.grammarVoxelsAdded > 0);
  assert.ok(chunkA.voxels.length <= 20000);
});

test('sparse voxel DAG round-trips grammar and base chunks exactly', () => {
  for (const recipe of [
    { worldId: 'sv-base', seed: 77 },
    { worldId: 'sv-gothic', seed: 78, architecture: { kind: 'gothic', density: 0.7 } }
  ]) {
    const chunk = recipe.architecture ? generateVoxelChunkWithGrammar(recipe, 1, -1, { maxVoxels: 18000 }) : core.generateVoxelChunk(recipe, 1, -1, { maxVoxels: 18000 });
    const encoded = encodeSparseVoxelDag(chunk);
    const check = verifyRoundTrip(chunk, encoded);
    assert.equal(check.ok, true);
    assert.deepEqual(canonical(decodeSparseVoxelDag(encoded)), canonical(chunk.voxels));
    assert.ok(encoded.nodes.length < encoded.stats.logicalLeafCells);
  }
});

test('GPU visibility path builds deterministic meshlets and keeps CPU fallback contract', async () => {
  const chunk = core.generateVoxelChunk({ worldId: 'gpu', seed: 91 }, 0, 0, { maxVoxels: 12000 });
  const a = buildMeshletsFromChunk(chunk, { brickSize: 4 });
  const b = buildMeshletsFromChunk(chunk, { brickSize: 4 });
  assert.deepEqual(a, b);
  assert.ok(a.length > 0);
  const plan = buildGpuVisibilityPlan([{ x: 0, z: 0, chunkData: chunk }], { x: 8, z: 8 }, { maxVisibleChunks: 4 }, { farDistance: 200 });
  assert.ok(plan.backendPreference.includes('cpu-hlod'));
  assert.ok(plan.meshlets.length > 0);
  assert.match(HZB_CULL_WGSL, /@compute/);
  const device = {
    createShaderModule(x) { return { type: 'shader', ...x }; },
    createComputePipeline(x) { return { type: 'pipeline', ...x }; }
  };
  const culler = await createWebGpuCuller(device);
  assert.equal(culler.workgroupSize, 64);
});

test('AudioWorklet source is deterministic and WebAudio fallback survives unavailable worklet', async () => {
  const recipe = { worldId: 'audio-v3', seed: 5150, audio: { intensity: 0.5 } };
  const a = buildAudioWorkletModuleSource(require('../lib/world-procedural-audio').buildAudioPlan(recipe));
  const b = buildAudioWorkletModuleSource(require('../lib/world-procedural-audio').buildAudioPlan(recipe));
  assert.equal(a, b);
  assert.match(a, new RegExp(PROCESSOR_NAME));
  assert.doesNotThrow(() => new Function(a));
  const starts = [];
  const context = {
    createGain() { return { gain: { value: 0 }, connect() {}, disconnect() {} }; },
    createOscillator() { return { type: '', frequency: { value: 0 }, connect() {}, disconnect() {}, start() { starts.push(true); }, stop() {} }; },
    destination: {}
  };
  const runtime = await installProceduralAudio(context, recipe);
  assert.equal(runtime.mode, 'oscillator-fallback');
  assert.ok(starts.length > 0);
  runtime.disconnect();
});

test('telemetry tournament promotes only verified regression-safe golden device evidence', async () => {
  const strong = { metrics: { visualScore: 92, animationScore: 90, stabilityScore: 96, fps: 60, bytes: 50000 }, verified: true, regressionFree: true, goldenVerified: true, deviceCertified: true };
  assert.ok(scoreMetrics(strong.metrics).score > 70);
  assert.equal(promotionEligible(strong), true);
  assert.equal(promotionEligible({ ...strong, regressionFree: false }), false);
  const selected = selectPromotionCandidate([strong, { ...strong, metrics: { ...strong.metrics, visualScore: 60 } }]);
  assert.ok(selected.winner);
  const t1 = await runTelemetryTournament({ worldId: 'tour', seed: 5 }, async (r) => ({ visualScore: 80 + r.style.detail * 10, stabilityScore: 95, animationScore: 90, fps: 60, bytes: 10000 }), { count: 5 });
  const t2 = await runTelemetryTournament({ worldId: 'tour', seed: 5 }, async (r) => ({ visualScore: 80 + r.style.detail * 10, stabilityScore: 95, animationScore: 90, fps: 60, bytes: 10000 }), { count: 5 });
  assert.deepEqual(t1.evaluated, t2.evaluated);
});

test('portable native signature is deterministic and catches a Godot/native mismatch', () => {
  const chunk = core.generateVoxelChunk({ worldId: 'native', seed: 81 }, 2, 1, { maxVoxels: 12000 });
  const sig = portableChunkSignature(chunk.voxels);
  assert.equal(sig, portableChunkSignature([...chunk.voxels].reverse()));
  const reference = makeNativeContractReport([chunk]);
  const same = structuredClone(reference);
  assert.equal(compareNativeReports(reference, same).ok, true);
  const broken = structuredClone(reference);
  broken.chunks[0].portableSignature = '0'.repeat(64);
  assert.equal(compareNativeReports(reference, broken).ok, false);
});

test('golden vectors include portable native signatures', () => {
  const vector = makeGoldenVector({ worldId: 'portable-golden', seed: 42 }, [[0, 0]]);
  assert.match(vector.chunks[0].portableSignature, /^[0-9a-f]{64}$/);
  assert.equal(verifyGoldenVector(vector).ok, true);
});

test('live Supabase adapter requires server mode and sends exact atomic RPC contract', async () => {
  const calls = [];
  function builder(table) {
    return {
      select() { return this; }, eq() { return this; }, gt() { return this; }, order() { return this; }, limit() { return this; },
      async maybeSingle() {
        if (table === 'voxel_worlds') return { data: { id: 'main', seed: 123, revision: 4, settings: {}, updated_at: 'x' }, error: null };
        return { data: null, error: null };
      }
    };
  }
  const client = {
    from(table) { return builder(table); },
    async rpc(name, args) { calls.push({ name, args }); return { data: { ok: true, revision: 5, contentHash: args.p_content_hash }, error: null }; }
  };
  const readOnly = createLiveSupabaseProceduralAdapter(client);
  const world = await readOnly.loadWorld('main');
  assert.equal(world.revision, 4);
  await assert.rejects(() => readOnly.atomicCommit({ worldId: 'main', recipe: world.recipe }), /server:true/);
  const server = createLiveSupabaseProceduralAdapter(client, { server: true });
  const next = compileWorldRecipe({ ...world.recipe, revision: 5 });
  const result = await server.atomicCommit({ worldId: 'main', expectedRevision: 4, recipe: next.recipe, contentHash: next.contentHash, idempotencyKey: 'k1' });
  assert.equal(result.ok, true);
  assert.equal(calls[0].name, 'world_procedural_recipe_commit_v3');
  assert.equal(calls[0].args.p_expected_revision, 4);
  assert.equal(calls[0].args.p_idempotency_key, 'k1');
});

test('distributed cache reuses factory asset registry without overwriting voxel snapshots', async () => {
  const assets = new Map();
  const live = {
    async loadChunkCache(key) { return assets.get(key) || null; },
    async saveChunkCache(row) { assets.set(row.key, { key: row.key, value: row.value, sha256: row.sha256 }); }
  };
  const cacheA = new DistributedChunkCache({ live, server: true });
  const chunk = core.generateVoxelChunk({ worldId: 'cache3', seed: 7 }, 0, 0, { maxVoxels: 12000 });
  await cacheA.set({ worldId: 'cache3', revision: 2, cx: 0, cz: 0, generator: 'base' }, chunk);
  const cacheB = new DistributedChunkCache({ live, server: false });
  const hit = await cacheB.get({ worldId: 'cache3', revision: 2, cx: 0, cz: 0, generator: 'base' });
  assert.equal(hit.source, 'factory-asset-cache');
  assert.equal(hit.value.encoding, 'svdag');
});

test('Navigator committer performs CAS commit, emits compact hint, and never stores raw message', async () => {
  let revision = 0;
  let recipe = core.normalizeRecipe({ worldId: 'navlive', seed: 999, revision: 0 });
  let hash = compileWorldRecipe(recipe).contentHash;
  const broadcasts = [];
  const live = {
    async loadWorld() { return { worldId: 'navlive', revision, recipe, contentHash: hash, settings: {} }; },
    async atomicCommit(input) {
      assert.equal(input.expectedRevision, revision);
      revision += 1; recipe = input.recipe; hash = input.contentHash;
      return { ok: true, revision, eventId: 'event-1', contentHash: hash };
    },
    createBroadcastChannel() { return { supported: true, async send(v) { broadcasts.push(v); }, async close() {} }; }
  };
  const commit = createNavigatorRecipeCommitter(live);
  const result = await commit.commitTurn({ worldId: 'navlive', output: { message: 'Темный готический город в тумане, мокрый камень' } });
  assert.equal(result.ok, true);
  assert.equal(result.revision, 1);
  assert.equal(result.recipe.architecture.kind, 'gothic');
  assert.equal(JSON.stringify(result.recipe).includes('Темный'), false);
  assert.equal(broadcasts.length, 1);
  assert.deepEqual(Object.keys(broadcasts[0]).sort(), ['contentHash','eventId','idempotent','revision','type','worldId'].sort());
  assert.equal(defaultIdempotencyKey('navlive', 0, { message: 'x' }), defaultIdempotencyKey('navlive', 0, { message: 'x' }));
});

test('Navigator committer retries a single revision conflict from latest authoritative state', async () => {
  let reads = 0;
  const base0 = core.normalizeRecipe({ worldId: 'race', seed: 1, revision: 0 });
  const base1 = core.normalizeRecipe({ worldId: 'race', seed: 1, revision: 1, atmosphere: { fog: 0.4 } });
  const live = {
    async loadWorld() { reads += 1; const r = reads === 1 ? base0 : base1; return { worldId: 'race', revision: r.revision, recipe: r, settings: {} }; },
    async atomicCommit(input) { if (input.expectedRevision === 0) return { ok: false, reason: 'revision_conflict' }; return { ok: true, revision: 2, eventId: 'e2', contentHash: input.contentHash }; }
  };
  const result = await createNavigatorRecipeCommitter(live, { maxRetries: 1 }).commitTurn({ worldId: 'race', output: { recipePatch: { atmosphere: { fog: 0.9 } } }, broadcast: false });
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 2);
  assert.equal(result.recipe.revision, 2);
});

test('worker CPU fallback with grammar matches direct grammar generator', async () => {
  const recipe = core.normalizeRecipe({ worldId: 'wg', seed: 2026, architecture: { kind: 'gothic', density: 0.7 } });
  const pool = new ProceduralWorkerPool({ useWorkers: false, size: 1 });
  try {
    const viaPool = await pool.generateChunk(recipe, 0, 0, { grammar: true, maxVoxels: 18000 });
    const direct = generateVoxelChunkWithGrammar(recipe, 0, 0, { grammar: true, maxVoxels: 18000 });
    assert.deepEqual(viaPool.voxels, direct.voxels);
  } finally { await pool.close(); }
});

test('V3 migration is additive, server-only, invoker, and does not touch realtime schema', () => {
  const file = path.join(__dirname, '..', 'supabase', 'migrations', '20260831072856_world_procedural_recipe_atomic_commit_v3.sql');
  const sql = fs.readFileSync(file, 'utf8').toLowerCase();
  assert.match(sql, /security\s+invoker/);
  assert.doesNotMatch(sql, /security\s+definer/);
  assert.doesNotMatch(sql, /create\s+table/);
  assert.match(sql, /revoke all on function[\s\S]+from anon/);
  assert.match(sql, /from authenticated/);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/);
  assert.doesNotMatch(sql, /realtime\s*\./);
  assert.match(sql, /voxel_world_events/);
  assert.match(sql, /voxel_worlds/);
});
