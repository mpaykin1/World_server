'use strict';

const core = require('../shared/world-procedural-core');
const { compileWorldRecipe, evolveWorldRecipe } = require('./world-procedural-recipe-engine');
const { buildAudioPlan } = require('./world-procedural-audio');
const { planVisibility } = require('./world-procedural-visibility');
const { buildFrameTimeline } = require('./world-procedural-animation-bridge');
const { buildTextureRecipe } = require('./world-procedural-texture-plan');

let enhancer = null;
try { enhancer = require('./world-quality-voxel-enhancer'); } catch { enhancer = null; }

function attachCompiledRecipe(world, compiled) {
  if (!world || typeof world !== 'object') throw new TypeError('world object required');
  if (!compiled?.recipe || !compiled?.contentHash) throw new TypeError('compiled recipe required');
  world.proceduralRecipe = {
    engine: compiled.engine,
    version: compiled.engineVersion,
    schemaVersion: compiled.recipe.schemaVersion,
    worldId: compiled.recipe.worldId,
    revision: compiled.recipe.revision,
    seed: compiled.recipe.seed,
    contentHash: compiled.contentHash,
    capabilityFingerprint: compiled.capabilityFingerprint,
    recipe: compiled.recipe
  };
  world.performance = {
    ...(world.performance || {}),
    targetFps: compiled.budget.targetFps,
    proceduralRecipeEngine: true,
    proceduralChunkRadius: compiled.budget.chunkRadius,
    proceduralMaxActiveVoxels: compiled.budget.maxActiveVoxels,
    proceduralAdaptiveBudget: true,
    proceduralOffMainThreadPreferred: true,
    proceduralWorkerProtocol: '/shared/world-procedural-worker.js',
    proceduralHlodVisibility: true,
    proceduralIncrementalInvalidation: true,
    proceduralAudio: compiled.recipe.audio.mode === 'procedural'
  };
  return world;
}

function enhanceExistingWorld(world, compiled, options = {}) {
  attachCompiledRecipe(world, compiled);
  if (options.enhanceExisting === false) return world;
  if (!enhancer?.enhanceVoxelWorld || !Array.isArray(world.voxels) || !Array.isArray(world.palette) || world.voxels.length === 0) return world;
  return enhancer.enhanceVoxelWorld(world, { seed: compiled.recipe.seed, policy: compiled.enhancerPolicy, rootDir: options.rootDir || process.cwd() });
}

function generateStandaloneWorld(recipeInput, capabilities = {}, options = {}) {
  const compiled = compileWorldRecipe(recipeInput, capabilities, options.qualityScale || 1);
  const coords = Array.isArray(options.chunks) && options.chunks.length ? options.chunks : [[0, 0]];
  const voxels = [];
  const palette = options.palette || core.DEFAULT_PALETTE.slice();
  const chunkStats = [];
  const dedupe = new Set();
  for (const pair of coords) {
    const chunk = core.generateVoxelChunk(compiled.recipe, pair?.[0] || 0, pair?.[1] || 0, compiled.generatorOptions);
    chunkStats.push({ ...chunk.chunk, ...chunk.stats });
    for (const voxel of chunk.voxels) {
      const key = `${voxel[0]},${voxel[1]},${voxel[2]}`;
      if (dedupe.has(key)) continue;
      dedupe.add(key);
      voxels.push(voxel);
      if (voxels.length >= compiled.budget.maxActiveVoxels) break;
    }
    if (voxels.length >= compiled.budget.maxActiveVoxels) break;
  }
  const world = {
    id: compiled.recipe.worldId,
    palette,
    voxels,
    stats: { logicalVoxels: voxels.length, proceduralChunks: chunkStats.length },
    proceduralChunks: chunkStats,
    proceduralAudioPlan: buildAudioPlan(compiled.recipe),
    proceduralFrameTimeline: buildFrameTimeline(compiled.recipe),
    proceduralTextureRecipe: buildTextureRecipe(compiled.recipe),
    proceduralVisibility: planVisibility(chunkStats.map((c) => ({ x: c.x, z: c.z, priority: 0 })), options.camera || { x: 0, z: 0 }, compiled.budget, { qualityScale: options.qualityScale || 1 })
  };
  return enhanceExistingWorld(world, compiled, { ...options, enhanceExisting: options.enhanceExisting !== false });
}

function evolveExistingWorld(world, recipePatch = {}, capabilities = {}, options = {}) {
  const previous = world?.proceduralRecipe?.recipe || { worldId: world?.id || 'main' };
  const compiled = evolveWorldRecipe(previous, recipePatch, capabilities, options.qualityScale || 1);
  return enhanceExistingWorld(world, compiled, options);
}

function makeRealtimeRecipeEvent(compiled, previousHash = null) {
  if (!compiled?.recipe || !compiled?.contentHash) throw new TypeError('compiled recipe required');
  return {
    event: 'world:recipe',
    version: 1,
    worldId: compiled.recipe.worldId,
    revision: compiled.recipe.revision,
    seed: compiled.recipe.seed,
    contentHash: compiled.contentHash,
    previousHash: previousHash || null,
    recipe: compiled.recipe
  };
}

function validateRealtimeRecipeEvent(event) {
  if (!event || event.event !== 'world:recipe' || event.version !== 1) return false;
  if (!/^[a-z0-9_-]{1,40}$/i.test(String(event.worldId || ''))) return false;
  if (!Number.isInteger(Number(event.revision)) || Number(event.revision) < 0) return false;
  if (!/^[a-f0-9]{64}$/i.test(String(event.contentHash || ''))) return false;
  return Boolean(event.recipe && typeof event.recipe === 'object');
}

module.exports = { attachCompiledRecipe, enhanceExistingWorld, generateStandaloneWorld, evolveExistingWorld, makeRealtimeRecipeEvent, validateRealtimeRecipeEvent };
