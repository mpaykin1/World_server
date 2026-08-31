'use strict';

const crypto = require('crypto');
const core = require('../shared/world-procedural-core');
const { compileWorldRecipe } = require('./world-procedural-recipe-engine');
const { portableChunkSignature } = require('./world-procedural-native-contract');

function sha256(value) { return crypto.createHash('sha256').update(value).digest('hex'); }
function chunkSignature(chunk) {
  const canonical = core.stableStringify({ engineVersion: chunk.engineVersion, recipeRevision: chunk.recipeRevision, chunk: chunk.chunk, voxels: chunk.voxels });
  return sha256(canonical);
}

function makeGoldenVector(recipeInput, coords = [[0, 0]], options = {}) {
  const compiled = compileWorldRecipe(recipeInput, { forceTier: 'medium' });
  const chunks = coords.map(([x, z]) => {
    const chunk = core.generateVoxelChunk(compiled.recipe, x, z, options.generatorOptions || { chunkSize: 16, surfaceDepth: 3, maxVoxels: 12000 });
    return {
      x,
      z,
      signature: chunkSignature(chunk),
      portableSignature: portableChunkSignature(chunk.voxels),
      voxels: chunk.voxels.length
    };
  });
  return { engineVersion: core.ENGINE_VERSION, schemaVersion: core.SCHEMA_VERSION, recipe: compiled.recipe, contentHash: compiled.contentHash, chunks };
}

function verifyGoldenVector(vector, options = {}) {
  if (!vector?.recipe || !vector?.contentHash || !Array.isArray(vector.chunks)) throw new TypeError('golden vector required');
  const compiled = compileWorldRecipe(vector.recipe, { forceTier: 'medium' });
  if (compiled.contentHash !== vector.contentHash) return { ok: false, reason: 'recipe-hash-mismatch', actual: compiled.contentHash, expected: vector.contentHash };
  for (const expected of vector.chunks) {
    const chunk = core.generateVoxelChunk(compiled.recipe, expected.x, expected.z, options.generatorOptions || { chunkSize: 16, surfaceDepth: 3, maxVoxels: 12000 });
    const actual = chunkSignature(chunk);
    if (actual !== expected.signature) return { ok: false, reason: 'chunk-signature-mismatch', chunk: [expected.x, expected.z], actual, expected: expected.signature };
    if (expected.portableSignature) {
      const portable = portableChunkSignature(chunk.voxels);
      if (portable !== expected.portableSignature) return { ok: false, reason: 'portable-signature-mismatch', chunk: [expected.x, expected.z], actual: portable, expected: expected.portableSignature };
    }
  }
  return { ok: true };
}

module.exports = { sha256, chunkSignature, portableChunkSignature, makeGoldenVector, verifyGoldenVector };
