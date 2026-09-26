'use strict';
// One pure map-to-simulation bridge, shared by Node and real Supabase Edge.
// Macro writes and Chain Reaction commits use the same voxel_worlds.updated_at CAS.
function syncGeography(settings, seed, entities, createWorld) {
  if (!Array.isArray(entities)) return settings;
  const types = new Set(entities.filter(e => e && typeof e.type === 'string')
    .map(e => e.type));
  if (types.size === 0 && !settings.chainReaction) return settings;
  const saved = settings.chainReaction;
  if (saved && (saved.schema !== 1 || !Number.isSafeInteger(saved.revision))) {
    throw Object.assign(new Error('Unsupported scenario version'), { status: 409 });
  }
  const world = saved || createWorld(String(seed));
  const land = {
    ...world.land,
    volcano: types.has('volcano'),
    coast: types.has('ocean'),
    forest: types.has('forest')
  };
  const changed = ['volcano', 'coast', 'forest']
    .some(key => world.land?.[key] !== land[key]);
  const nextRevision = world.revision + (changed ? 1 : 0);
  if (!Number.isSafeInteger(nextRevision)) {
    throw Object.assign(new Error('Scenario revision exhausted'), { status: 409 });
  }
  const event = { kind: 'geography_changed', tick: world.tick,
    revision: nextRevision, land: { ...land } };
  const next = { ...world, land, revision: nextRevision,
    history: changed ? [...world.history, event] : world.history };
  return { ...settings, chainReaction: next };
}

const WorldConsequenceGeography = { syncGeography };
if (typeof globalThis !== 'undefined') {
  globalThis.WorldConsequenceGeography = WorldConsequenceGeography;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WorldConsequenceGeography;
}
