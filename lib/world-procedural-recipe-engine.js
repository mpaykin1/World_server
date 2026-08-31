'use strict';

const crypto = require('crypto');
const core = require('../shared/world-procedural-core');
const { budgetForDevice, deriveEnhancerPolicy, deriveGeneratorOptions } = require('./world-procedural-budget');

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function contentHash(recipeInput) {
  return sha256(core.stableStringify(core.normalizeRecipe(recipeInput)));
}

function capabilityFingerprint(capabilities = {}) {
  const safe = {
    deviceMemory: Number(capabilities.deviceMemory) || 0,
    hardwareConcurrency: Number(capabilities.hardwareConcurrency) || 0,
    isMobile: Boolean(capabilities.isMobile),
    gpuTier: Number(capabilities.gpuTier) || 0,
    maxTextureSize: Number(capabilities.maxTextureSize) || 0,
    forceTier: capabilities.forceTier || null
  };
  return sha256(core.stableStringify(safe)).slice(0, 16);
}

function compileWorldRecipe(input = {}, capabilities = {}, qualityScale = 1) {
  const recipe = core.normalizeRecipe(input);
  const hash = contentHash(recipe);
  const budget = budgetForDevice(recipe, capabilities, qualityScale);
  return Object.freeze({
    engine: 'world-procedural-recipe-engine',
    engineVersion: core.ENGINE_VERSION,
    recipe,
    contentHash: hash,
    capabilityFingerprint: capabilityFingerprint(capabilities),
    budget,
    enhancerPolicy: deriveEnhancerPolicy(budget),
    generatorOptions: deriveGeneratorOptions(budget)
  });
}

function evolveWorldRecipe(previousInput, patch = {}, capabilities = {}, qualityScale = 1) {
  const previous = core.normalizeRecipe(previousInput || {});
  const merged = core.deepMerge(previous, patch || {});
  merged.revision = previous.revision + 1;
  if (typeof patch.seed === 'undefined') merged.seed = previous.seed;
  return compileWorldRecipe(merged, capabilities, qualityScale);
}

function navigatorMutation(previousInput, navigatorOutput = {}, capabilities = {}, qualityScale = 1) {
  const recipePatch = (navigatorOutput.recipePatch && typeof navigatorOutput.recipePatch === 'object') ? navigatorOutput.recipePatch : {};
  const previous = core.normalizeRecipe(previousInput || {});
  const patch = core.deepMerge({}, recipePatch);
  patch.source = core.deepMerge(previous.source, patch.source || {});
  patch.source.navigatorTurn = previous.source.navigatorTurn + 1;
  if (navigatorOutput.message != null) patch.source.sourceMessageHash32 = core.stringHash32(String(navigatorOutput.message).slice(0, 4096));
  return evolveWorldRecipe(previous, patch, capabilities, qualityScale);
}

function createRecipePacket(compiled, previousHash = null) {
  if (!compiled || !compiled.recipe || !compiled.contentHash) throw new TypeError('compiled world recipe required');
  return {
    type: 'world:recipe:v1',
    schemaVersion: core.SCHEMA_VERSION,
    worldId: compiled.recipe.worldId,
    revision: compiled.recipe.revision,
    contentHash: compiled.contentHash,
    previousHash: previousHash || null,
    recipe: compiled.recipe
  };
}

function createRecipeDeltaPacket(previousCompiled, nextCompiled) {
  if (!previousCompiled?.recipe || !nextCompiled?.recipe) throw new TypeError('previous and next compiled recipes required');
  if (previousCompiled.recipe.worldId !== nextCompiled.recipe.worldId) throw new Error('cannot diff recipes from different worlds');
  return {
    type: 'world:recipe-delta:v1',
    schemaVersion: core.SCHEMA_VERSION,
    worldId: nextCompiled.recipe.worldId,
    revision: nextCompiled.recipe.revision,
    previousHash: previousCompiled.contentHash,
    contentHash: nextCompiled.contentHash,
    delta: core.diffObject(previousCompiled.recipe, nextCompiled.recipe) || {}
  };
}

function applyRecipeDeltaPacket(previousCompiled, packet, capabilities = {}, qualityScale = 1) {
  if (!previousCompiled?.recipe || !packet || packet.type !== 'world:recipe-delta:v1') throw new TypeError('valid recipe delta packet required');
  if (packet.previousHash !== previousCompiled.contentHash) throw new Error('recipe delta base hash mismatch');
  const merged = core.applyDelta(previousCompiled.recipe, packet.delta);
  const compiled = compileWorldRecipe(merged, capabilities, qualityScale);
  if (compiled.contentHash !== packet.contentHash) throw new Error('recipe delta content hash mismatch');
  return compiled;
}

module.exports = {
  sha256,
  contentHash,
  capabilityFingerprint,
  compileWorldRecipe,
  evolveWorldRecipe,
  navigatorMutation,
  createRecipePacket,
  createRecipeDeltaPacket,
  applyRecipeDeltaPacket
};
