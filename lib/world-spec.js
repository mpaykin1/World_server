'use strict';

// World Spec generation and merge composition for the improve-world-home
// pipeline: QUESTIONNAIRE -> STORY -> BLUEPRINT -> WORLD SPEC -> WORLD.
//
// A World Spec is the durable, structured content behind a world's public
// page: its characters, its "worlds" (the questionnaire's own term for the
// setting/place entities), the narrative scene text, and the chosen format.
// Deterministic and dependency-free by design (see lib/narrative-blueprint.js
// for why: no LLM SDK exists anywhere in this repo).

function cloneEntities(list, sourceTag) {
  if (!Array.isArray(list)) return [];
  // Preserve a deeper origin tag already carried by an earlier merge (AB+C
  // must keep A/B's own provenance on their characters, not relabel them
  // "from AB") -- only entities with no origin yet get this merge's tag.
  return list.map((entity) => Object.assign({ _sourceWorldId: sourceTag }, entity));
}

/**
 * Build a World Spec from a single Story (answers + blueprint).
 * @param {{answers: object, blueprint: {title: string, mode: string, scene: string}}} story
 */
function buildWorldSpec(story) {
  const answers = story.answers || {};
  const blueprint = story.blueprint || {};
  return {
    title: blueprint.title || 'Новая история',
    mode: blueprint.mode || '',
    scene: blueprint.scene || '',
    format: answers.format || '',
    characters: Array.isArray(answers.chars) ? answers.chars : [],
    worlds: Array.isArray(answers.worlds) ? answers.worlds : [],
    provenance: { sourceStoryIds: [story.id].filter(Boolean) }
  };
}

/**
 * Compose two World Specs into one (A+B -> AB), preserving both sources'
 * characters/worlds with a provenance tag on every element, and tracking
 * which source world(s) contributed to the merged result overall. Never
 * mutates its inputs.
 * @param {object} specA
 * @param {object} specB
 * @param {{aWorldId: string, bWorldId: string}} ids
 */
function mergeWorldSpecs(specA, specB, ids) {
  const characters = [
    ...cloneEntities(specA.characters, ids.aWorldId),
    ...cloneEntities(specB.characters, ids.bWorldId)
  ];
  const worlds = [
    ...cloneEntities(specA.worlds, ids.aWorldId),
    ...cloneEntities(specB.worlds, ids.bWorldId)
  ];
  const scene = 'Два мира начинают пересекаться.\n\n' +
    `${specA.title || 'Первая история'}: ${specA.scene || ''}\n\n` +
    `${specB.title || 'Вторая история'}: ${specB.scene || ''}\n\n` +
    'Они ещё не переписаны — здесь появляется общий слой, в котором можно искать совместимые точки пересечения.';
  const format = specA.format && specA.format === specB.format ? specA.format : (specA.format || specB.format || '');
  const sourceStoryIds = [
    ...((specA.provenance && specA.provenance.sourceStoryIds) || []),
    ...((specB.provenance && specB.provenance.sourceStoryIds) || [])
  ];
  return {
    title: `${specA.title || 'Мир A'} + ${specB.title || 'Мир B'}`,
    mode: specA.mode || specB.mode || '',
    scene,
    format,
    characters,
    worlds,
    provenance: {
      sourceStoryIds,
      sourceWorldIds: [ids.aWorldId, ids.bWorldId],
      characterOrigins: Object.fromEntries(characters.map((c, i) => [i, c._sourceWorldId])),
      worldOrigins: Object.fromEntries(worlds.map((w, i) => [i, w._sourceWorldId]))
    }
  };
}

module.exports = { buildWorldSpec, mergeWorldSpecs };
