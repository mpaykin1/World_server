'use strict';

const crypto = require('crypto');
const core = require('../shared/world-procedural-core');
function sha256(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }

function buildTextureRecipe(recipeInput = {}, options = {}) {
  const recipe = core.normalizeRecipe(recipeInput);
  const resolution = Math.max(64, Math.min(4096, Math.trunc(Number(options.resolution) || (recipe.style.detail > 0.8 ? 1024 : 512))));
  const ops = [
    { op: 'fbm', seed: recipe.seed ^ 0x51f15e, scale: +(0.8 + recipe.terrain.frequency * 20).toFixed(4), octaves: recipe.terrain.octaves },
    { op: 'warp', amount: +(0.08 + recipe.terrain.erosion * 0.3).toFixed(4) },
    { op: 'roughness', value: +(0.9 - recipe.style.wetness * 0.55).toFixed(4) },
    { op: 'normalFromHeight', strength: +(0.4 + recipe.style.detail * 0.8).toFixed(4) },
    { op: 'wetness', value: recipe.style.wetness },
    { op: 'emissiveMask', value: recipe.style.emissive }
  ];
  const plan = { engine: 'world-procedural-texture-recipe-v1', materialTheme: recipe.style.materialTheme, resolution, ops };
  return { ...plan, contentHash: sha256(core.stableStringify(plan)) };
}

function makeTextureBakeJobs(recipeInput = {}, options = {}) {
  const texture = buildTextureRecipe(recipeInput, options);
  const formats = options.formats || ['ktx2'];
  return formats.map((format) => ({
    id: `${texture.contentHash.slice(0, 16)}-${format}`,
    format,
    source: texture,
    compression: format === 'ktx2' ? 'BasisU/UASTC candidate' : 'lossless',
    promoteOnlyAfter: ['visual regression PASS', 'GPU upload/runtime benchmark PASS', 'license notice present']
  }));
}

module.exports = { buildTextureRecipe, makeTextureBakeJobs };
