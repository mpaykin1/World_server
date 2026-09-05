'use strict';

// Connects world-procedural-recipe-engine (V3) output to world-procedural-vfx
// (V3) reactions, so a Navigator-driven recipe patch materializes with an
// appropriate ambient VFX response instead of the two engines only
// coexisting in the same repo. Mirrors world-procedural-animation-bridge.js:
// a pure build*() function plus a duck-typed installIntoXRuntime() adapter,
// so it degrades safely if the VFX runtime isn't present.

const core = require('../shared/world-procedural-core');

// architecture.kind values match the biome/architecture grammar documented
// in WORLD_PROCEDURAL_RECIPE_ENGINE.md (gothic city, ruins, forest, mixed).
// VFX's reaction-planner only recognizes a fixed intent vocabulary
// (reveal/discovery/danger/calm/connection/transformation); anything else
// falls back to its own 'reveal' default, so an unmapped kind is safe too.
const ARCHITECTURE_INTENT = {
  gothic: 'transformation',
  'gothic-city': 'transformation',
  ruins: 'discovery',
  forest: 'calm',
  mixed: 'connection'
};

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

// Recipes with no distinct architecture (kind === 'none') still carry an
// atmosphere; a dark/foggy world reads as tense even without buildings.
function intentFromAtmosphere(atmosphere) {
  if (atmosphere.darkness >= 0.7 || atmosphere.weather === 'storm') return 'danger';
  if (atmosphere.fog >= 0.6) return 'discovery';
  return 'reveal';
}

// recipeInput accepts the same shape core.normalizeRecipe does, OR a
// world-procedural-bridge.js makeRealtimeRecipeEvent() envelope (it reads
// event.recipe when present) so callers can wire straight off the
// Realtime broadcast hint without re-deriving the recipe first.
function buildVfxPlan(recipeInput = {}, options = {}) {
  const source = recipeInput && recipeInput.event === 'world:recipe' && recipeInput.recipe
    ? recipeInput.recipe
    : recipeInput;
  const recipe = core.normalizeRecipe(source);
  const kind = String(recipe.architecture.kind || 'none').toLowerCase();
  const intent = recipe.architecture.kind !== 'none' && ARCHITECTURE_INTENT[kind]
    ? ARCHITECTURE_INTENT[kind]
    : intentFromAtmosphere(recipe.atmosphere);

  const importance = clamp01(
    recipe.architecture.kind !== 'none'
      ? 0.35 + recipe.architecture.density * 0.4 + recipe.architecture.ruin * 0.25
      : 0.25 + recipe.atmosphere.darkness * 0.3 + recipe.atmosphere.fog * 0.2
  );

  const position = Array.isArray(options.position) && options.position.length === 3
    ? options.position
    : [0, 0, 0];

  return {
    engine: 'world-procedural-vfx-bridge-v1',
    seed: recipe.seed,
    worldId: recipe.worldId,
    revision: recipe.revision,
    events: [{
      intent,
      position,
      importance: +importance.toFixed(4),
      seed: recipe.seed,
      idPrefix: `recipe:${recipe.worldId}:${recipe.revision}`
    }]
  };
}

// runtime is the object window.WorldProceduralVfx.runtime exposes (or the
// runtime returned by createProductionVfxRuntime directly) - it only needs
// a semantic(detail) method, matching production-runtime.mjs's contract.
function installIntoVfxRuntime(runtime, plan) {
  if (!plan?.events?.length) return { installed: 0, mode: 'empty-plan' };
  if (runtime && typeof runtime.semantic === 'function') {
    let installed = 0;
    for (const event of plan.events) {
      const spawned = runtime.semantic(event);
      installed += Array.isArray(spawned) ? spawned.length : 0;
    }
    return { installed, mode: 'semantic' };
  }
  return { installed: 0, mode: 'adapter-required', plan };
}

module.exports = { buildVfxPlan, installIntoVfxRuntime, ARCHITECTURE_INTENT };
