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

// The scene text already embeds the questionnaire's own storyDesire/
// storySource tension answers (see lib/narrative-blueprint.js#sceneFor) --
// scanning it for drama keywords is a free, deterministic way to let the
// user's actual conflict/tension answers shape how rugged the generated
// terrain is, with no change to the World Spec's shape and no new field to
// thread through mergeWorldSpecs.
const DRAMA_KEYWORDS_HIGH = ['конфликт', 'напряж', 'тревог', 'опасн', 'страх', 'борьб', 'война', 'угроза'];
const DRAMA_KEYWORDS_LOW = ['гармон', 'спокой', 'расслабл', 'уют', 'безопасн'];

// Per-theme sky/fog tint and tree density -- a real (if simple) palette +
// atmosphere + object-density bridge from theme to rendering, bounded to
// stay cheap on mobile (no new geometry or draw calls, just tint/threshold
// numbers the existing renderer already reads).
const THEME_PALETTE = {
  snow: { skyTint: 0xcfe8ff, fogNear: 40, fogFar: 90 },
  desert: { skyTint: 0xf3dfa0, fogNear: 55, fogFar: 130 },
  forest: { skyTint: 0x6fa88a, fogNear: 30, fogFar: 70 },
  plains: { skyTint: 0x7fbced, fogNear: 45, fogFar: 95 }
};
const THEME_TREE_DENSITY = { snow: 0.6, desert: 0.15, forest: 1.6, plains: 1 };

function deriveTheme(spec) {
  const text = `${spec.title || ''} ${spec.scene || ''}`.toLowerCase();
  for (const [theme, keywords] of Object.entries(THEME_KEYWORDS)) {
    if (keywords.some((k) => text.includes(k))) return theme;
  }
  return 'plains';
}

// Returns a bounded multiplier: 0.6 (calm terrain) .. 1.5 (dramatic terrain).
function deriveHeightScale(spec) {
  const text = `${spec.title || ''} ${spec.scene || ''}`.toLowerCase();
  const highHits = DRAMA_KEYWORDS_HIGH.filter((k) => text.includes(k)).length;
  const lowHits = DRAMA_KEYWORDS_LOW.filter((k) => text.includes(k)).length;
  if (highHits > lowHits) return 1.5;
  if (lowHits > highHits) return 0.6;
  return 1;
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
  const theme = deriveTheme(spec);
  const palette = THEME_PALETTE[theme] || THEME_PALETTE.plains;
  return {
    id: worldId,
    seed: seedFromWorldId(worldId),
    settings: {
      name: String(spec.title || 'World').slice(0, 80),
      chunkSize: 16,
      minY: -16,
      maxY: 96,
      generatorVersion: 2,
      theme,
      skyTint: palette.skyTint,
      fogNear: palette.fogNear,
      fogFar: palette.fogFar,
      treeDensity: THEME_TREE_DENSITY[theme] ?? 1,
      heightScale: deriveHeightScale(spec)
    }
  };
}

module.exports = { deriveVoxelWorld, deriveTheme, deriveHeightScale, seedFromWorldId, THEME_KEYWORDS, THEME_PALETTE, THEME_TREE_DENSITY };
