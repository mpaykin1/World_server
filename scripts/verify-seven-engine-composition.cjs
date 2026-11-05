'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const engineRoot = process.env.SEVEN_ENGINE_ROOT;
if (!engineRoot || !path.isAbsolute(engineRoot)) throw new Error('SEVEN_ENGINE_ROOT must name the absolute pinned fixture directory');
const engine = name => require(path.join(engineRoot, name + '.cjs'));
const { runSevenEngines } = engine('seven-adapters');
const { runCorePipeline } = engine('core-adapters');
const { createScenario } = engine('story');
const { createRuleSet } = engine('mechanics');
const { createPhysicsConfig } = engine('physics');
const { createStyleSheet } = engine('visual');
function card(calc = false) {
  return { id: 'integration-regression', genre: 'adventure', startLocation: 'bridge',
    engines_enabled: [...(calc ? ['calc'] : []), 'dramaturgy', 'story', 'mechanics', 'physics', 'visual', 'onboarding'],
    controls: { keyboard: ['WASD', 'Space'], touch: ['swipe', 'tap'] },
    character_seed: { name: 'Original hero', method: 'natal' },
    world: { gravity: 9.8, maxStepMeters: 0.8, solidLayers: ['stone'], bodyRadius: 0.3, bodyHeight: 1.8 },
    world_laws: ['mist follows the river'], performanceBudget: { targetFps: 30 } };
}
for (const calc of [false, true]) test('real seven-engine path calc=' + calc, () => {
  for (const randomSeed of [3, 42, 71]) {
    const gameCard = card(calc), before = structuredClone(gameCard);
    const result = runSevenEngines({ gameCard, randomSeed });
    assert.deepEqual(result.errors, []);
    assert.equal(result.steps.length, 7);
    assert.equal(result.steps.filter(s => s.status === 'produced_unverified').length, calc ? 7 : 6);
    assert.equal(result.outputs.story.scenes.length, 6);
    assert.equal(result.outputs.physics.gravity, 9.8);
    assert.equal(result.outputs.mechanics.world.maxStepMeters, 0.8);
    assert.ok(result.outputs.onboarding.steps.length > 0);
    assert.deepEqual(gameCard, before);
    assert.deepEqual(result, runSevenEngines({ gameCard, randomSeed }));
  }
});
test('enabled calc without explicit method fails rather than claiming completion', () => {
  const gameCard = card(true); delete gameCard.character_seed.method;
  const result = runSevenEngines({ gameCard, randomSeed: 42 });
  assert.equal(result.errors[0].engine, 'calc');
  assert.equal(result.steps.at(-1).status, 'failed');
  assert.equal(result.outputs.onboarding, undefined);
});
test('real core path isolates producer result and caller when next stage fails', () => {
  const gameCard = card(), recentGames = [], before = structuredClone(gameCard);
  let bible, generated;
  const result = runCorePipeline({ gameCard, recentGames, randomSeed: 42, adapters: {
    story(ctx) {
      bible = structuredClone(ctx.outputs.dramaturgy);
      ctx.gameCard.id = 'tampered'; ctx.recentGames.push({ primaryConflict: 'tampered' });
      generated = createScenario({ storyBible: bible, gameCard: before, randomSeed: 42, recentGames: [] });
      return { value: generated };
    },
    mechanics(ctx) {
      generated.scenes[0].id = 'producer-alias';
      ctx.outputs.story.scenes[0].id = 'consumer-alias';
      ctx.outputs.dramaturgy.gameId = 'tampered';
      throw new Error('intentional downstream failure');
    }
  }});
  assert.equal(result.errors[0].engine, 'mechanics');
  assert.equal(result.gameId, before.id);
  assert.deepEqual(gameCard, before); assert.deepEqual(recentGames, []);
  assert.deepEqual(result.outputs.dramaturgy, bible);
  assert.notEqual(result.outputs.story.scenes[0].id, 'producer-alias');
  assert.notEqual(result.outputs.story.scenes[0].id, 'consumer-alias');
});
test('optional null adapter continues through all real core consumers', () => {
  const gameCard = card(true);
  const result = runCorePipeline({ gameCard, randomSeed: 42, adapters: {
    calc: () => ({ value: null }),
    story: ctx => ({ value: createScenario({ storyBible: ctx.outputs.dramaturgy, gameCard: ctx.gameCard, randomSeed: ctx.randomSeed, recentGames: ctx.recentGames }) }),
    mechanics: ctx => ({ value: createRuleSet({ scenario: ctx.outputs.story, genre: ctx.gameCard.genre, world: ctx.gameCard.world }) }),
    physics: ctx => ({ value: createPhysicsConfig(ctx.outputs.mechanics) }),
    visual: ctx => ({ value: createStyleSheet({ physics: ctx.outputs.physics, world_laws: ctx.outputs.dramaturgy.world_laws, randomSeed: ctx.randomSeed, performanceBudget: ctx.gameCard.performanceBudget }) })
  }});
  assert.deepEqual(result.errors, []);
  assert.equal(result.steps[0].status, 'skipped_optional');
  assert.equal(result.steps[0].out_ref, null);
  assert.ok(result.outputs.onboarding.steps.length > 0);
});
