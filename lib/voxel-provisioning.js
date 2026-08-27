'use strict';

// Bridges a World Spec (lib/world-spec.js) to the existing voxel_worlds/
// apps/voxel-world runtime, so a finished questionnaire produces an
// actually playable world instead of only a data record. Per AGENTS.md's
// dual-layer rule: this deterministic, free, keyword-based mapping from
// narrative text to terrain theme IS the mandatory baseline layer, not a
// placeholder waiting for an LLM -- a real local-LLM semantic-interpretation
// layer was investigated and found architecturally incompatible with this
// project's Vercel Hobby serverless deployment (no persistent disk for a
// model file, strict function size/time limits); see WORK_IN_PROGRESS.md.
// This module is what "questionnaire -> deterministic World Spec -> runtime"
// actually means in code.

const THEME_KEYWORDS = {
  snow: ['снег', 'снега', 'снежн', 'лёд', 'лед', 'ледян', 'зим', 'мороз', 'холод'],
  desert: ['пустын', 'песок', 'песч', 'жар', 'зно', 'сухо'],
  forest: ['лес', 'леса', 'чащ', 'дерев', 'роща', 'джунгл']
};

function deriveTheme(spec) {
  const text = `${spec.title || ''} ${spec.scene || ''}`.toLowerCase();
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return theme;
  }
  return 'plains';
}

// A world's own id already is a stable, unique string -- hashing it gives a
// deterministic seed with no extra randomness or state to track: the same
// world id always regenerates the exact same terrain.
function seedFromWorldId(worldId) {
  let h = 0;
  for (let i = 0; i < worldId.length; i++) {
    h = (Math.imul(h, 31) + worldId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

function deriveVoxelWorld(spec, worldId) {
  return {
    id: worldId,
    seed: seedFromWorldId(worldId),
    settings: {
      name: String(spec.title || 'World').slice(0, 80),
      chunkSize: 16,
      minY: -16,
      maxY: 96,
      generatorVersion: 1,
      theme: deriveTheme(spec)
    }
  };
}

module.exports = { deriveVoxelWorld, deriveTheme, seedFromWorldId, THEME_KEYWORDS };
