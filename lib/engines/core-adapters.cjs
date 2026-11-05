'use strict';

// Execute existing engines through the canonical seven-stage pipeline.
// All other engines must be supplied by real consumers; never invent their outputs.
const { runPipeline, SEQUENCE } = require('./pipeline.cjs');
const { createStoryBible, validateStoryBible } = require('./dramaturgy.cjs');
const { createOnboardingScript } = require('./onboarding.cjs');

function createCoreAdapters(external = {}) {
  if (!external || typeof external !== 'object' || Array.isArray(external) ||
      Object.keys(external).some(k => !SEQUENCE.includes(k) || k === 'dramaturgy' || k === 'onboarding' ||
        typeof external[k] !== 'function')) {
    throw new TypeError('external adapters must be functions for other known engines only');
  }
  return {
    ...external,
    dramaturgy({ gameCard, randomSeed, recentGames }) {
      const bible = createStoryBible({ gameCard, randomSeed, recentGames });
      const verified = validateStoryBible(bible, recentGames);
      if (!verified.ok) throw new Error('StoryBible violated nonrepeat rules: ' + verified.errors.join('; '));
      return { value: bible };
    },
    onboarding({ gameCard, outputs }) {
      // Requires actual mechanics, visuals, and controls. Missing data fails the pipeline.
      const value = createOnboardingScript({
        ruleSet: outputs.mechanics,
        styleSheet: outputs.visual,
        controls: gameCard.controls,
        firstRun: gameCard.firstRun === undefined ? true : gameCard.firstRun
      });
      return { value };
    }
  };
}
function runCorePipeline({ gameCard, randomSeed, recentGames = [], adapters = {}, timestamp = null }) {
  return runPipeline({
    gameCard, randomSeed, recentGames, timestamp,
    adapters: createCoreAdapters(adapters)
  });
}
module.exports = { createCoreAdapters, runCorePipeline };
