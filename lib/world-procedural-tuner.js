'use strict';

const core = require('../shared/world-procedural-core');

function dominates(a, b, keys) {
  let strictly = false;
  for (const key of keys) {
    const direction = key.direction === 'min' ? -1 : 1;
    const av = Number(a.metrics[key.name]) * direction;
    const bv = Number(b.metrics[key.name]) * direction;
    if (av < bv) return false;
    if (av > bv) strictly = true;
  }
  return strictly;
}

function paretoFront(candidates, objectives = [{ name: 'quality', direction: 'max' }, { name: 'fps', direction: 'max' }, { name: 'bytes', direction: 'min' }]) {
  return candidates.filter((candidate, i) => !candidates.some((other, j) => i !== j && dominates(other, candidate, objectives)));
}

function generateCandidates(recipeInput, options = {}) {
  const recipe = core.normalizeRecipe(recipeInput);
  const count = Math.max(1, Math.min(64, Math.trunc(Number(options.count) || 12)));
  const random = core.mulberry32(recipe.seed ^ 0x7f4a7c15 ^ recipe.revision);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const detailDelta = (random() - 0.5) * 0.24;
    const densityDelta = (random() - 0.5) * 0.2;
    const fogDelta = (random() - 0.5) * 0.18;
    const candidate = core.deepMerge(recipe, {
      style: { detail: core.clamp(recipe.style.detail + detailDelta, 0.2, 1) },
      architecture: { density: core.clamp(recipe.architecture.density + densityDelta, 0, 1) },
      atmosphere: { fog: core.clamp(recipe.atmosphere.fog + fogDelta, 0, 1) }
    });
    out.push(core.normalizeRecipe(candidate));
  }
  return out;
}

async function tuneRecipe(recipeInput, evaluator, options = {}) {
  if (typeof evaluator !== 'function') throw new TypeError('evaluator function required');
  const candidates = generateCandidates(recipeInput, options);
  const evaluated = [];
  for (const recipe of candidates) evaluated.push({ recipe, metrics: await evaluator(recipe) });
  const front = paretoFront(evaluated, options.objectives);
  return { candidates: evaluated, pareto: front };
}

module.exports = { dominates, paretoFront, generateCandidates, tuneRecipe };
