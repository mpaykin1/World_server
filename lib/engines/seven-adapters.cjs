'use strict';

// Compose actual engine modules through the already existing seven-stage pipeline.
// Dependencies are loaded when invoked; this draft is only mergeable after PRs
// #581-586 have passed independent review and landed in master.
function runSevenEngines({ gameCard, randomSeed, recentGames = [], timestamp = null } = {}) {
  const { runCorePipeline } = require('./core-adapters.cjs');
  const { createCalcProfile } = require('./calc.cjs');
  const { createScenario } = require('./story.cjs');
  const { createRuleSet } = require('./mechanics.cjs');
  const { createPhysicsConfig } = require('./physics.cjs');
  const { createStyleSheet } = require('./visual.cjs');
  const adapters = {
    calc({ gameCard, randomSeed }) {
      // Optional does not mean fabricated: enabling calc requires authored data.
      const seed = gameCard.character_seed;
      if (!seed || typeof seed !== 'object' || Array.isArray(seed))
        throw new TypeError('calc enabled but gameCard.character_seed is missing');
      const value = createCalcProfile({ ...seed, randomSeed });
      if (value === null) throw new TypeError('calc enabled but character_seed.method is omitted');
      return { value };
    },
    story({ gameCard, randomSeed, recentGames, outputs }) {
      return { value: createScenario({
        storyBible: outputs.dramaturgy, gameCard, randomSeed, recentGames
      }) };
    },
    mechanics({ gameCard, outputs }) {
      return { value: createRuleSet({
        scenario: outputs.story, genre: gameCard.genre, world: gameCard.world
      }) };
    },
    physics({ outputs }) {
      return { value: createPhysicsConfig(outputs.mechanics) };
    },
    visual({ gameCard, randomSeed, outputs }) {
      return { value: createStyleSheet({
        physics: outputs.physics,
        world_laws: outputs.dramaturgy.world_laws,
        referenceIds: gameCard.referenceIds ?? [],
        performanceBudget: gameCard.performanceBudget,
        randomSeed
      }) };
    }
  };
  return runCorePipeline({ gameCard, randomSeed, recentGames, timestamp, adapters });
}
module.exports = { runSevenEngines };
