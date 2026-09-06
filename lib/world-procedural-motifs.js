'use strict';

const core = require('../shared/world-procedural-core');

const MOTIFS = Object.freeze({
  'wet-gothic-night': Object.freeze({ style: { materialTheme: 'wet-black-stone', wetness: 0.88, detail: 0.92 }, architecture: { kind: 'gothic', density: 0.54, verticality: 0.84 }, atmosphere: { darkness: 0.82, fog: 0.54, weather: 'rain' }, audio: { ambience: 'rain-stone', intensity: 0.34 } }),
  'dark-eye-void': Object.freeze({ style: { materialTheme: 'void', detail: 0.62, emissive: 0.18 }, architecture: { kind: 'none', density: 0 }, atmosphere: { darkness: 0.96, fog: 0.68, weather: 'none' }, audio: { ambience: 'dark-air', intensity: 0.18 } }),
  'voxel-ruins': Object.freeze({ style: { materialTheme: 'aged-stone', detail: 0.82 }, architecture: { kind: 'ruins', density: 0.42, ruin: 0.62, verticality: 0.58 }, atmosphere: { fog: 0.38, darkness: 0.58 } })
});

function applyMotif(recipeInput, motifId) {
  const motif = MOTIFS[String(motifId)];
  if (!motif) throw new Error(`unknown procedural motif: ${motifId}`);
  return core.normalizeRecipe(core.deepMerge(core.normalizeRecipe(recipeInput), motif));
}

module.exports = { MOTIFS, applyMotif };
