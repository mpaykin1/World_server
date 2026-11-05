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
const { packArtifact, verifyArtifact } = engine('artifact');
const { createMechanicsState, advanceMechanics, finishMechanics } = engine('mechanics');
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
    const ruleSet = result.outputs.mechanics;
    let state = createMechanicsState(ruleSet);
    for (const scene of ruleSet.scenes) {
      state = advanceMechanics(ruleSet, state, { type: 'enter', sceneId: scene.id });
      for (const choice of ruleSet.choiceBindings.filter(c => c.scene === scene.id)) {
        state = advanceMechanics(ruleSet, state, {
          type: 'choose', choiceId: choice.id, optionId: choice.options[0].id
        });
      }
    }
    const ending = ruleSet.endings.find(e => Object.entries(e.traceConditions)
      .every(([key, threshold]) => state.traces[key] >= threshold));
    assert.ok(ending, 'real choices must earn at least one ending');
    assert.equal(finishMechanics(ruleSet, state, ending.id).ended, ending.id);
    const atmosphere = result.outputs.visual.shaders.atmosphere;
    assert.match(atmosphere.vertexShader, /^#version 300 es/);
    assert.match(atmosphere.fragmentShader, /^#version 300 es/);
    // Packaging fixture only: this HTML is deliberately NOT a playable runtime.
    const input = { gameId: gameCard.id, sourceCommit: 'b1c093d999adb927ed5c3593c6fc529679404967',
      pipelineResult: result, files: {
        'index.html': '<!doctype html><title>Unverified packaging fixture</title>',
        'data/pipeline.json': JSON.stringify(result),
        'shaders/atmosphere-vertex.glsl': atmosphere.vertexShader,
        'shaders/atmosphere-fragment.glsl': atmosphere.fragmentShader
      } };
    const packaged = packArtifact(input);
    assert.equal(verifyArtifact(packaged), true);
    assert.deepEqual(packaged, packArtifact(input));
    assert.equal(packaged.manifest.status, 'packaged_unverified');
    assert.equal(packaged.manifest.validation.publication, 'not_published');
    assert.equal(packaged.manifest.validation.rights, 'not_verified');
    assert.equal(packaged.manifest.stages.length, 7);
    packaged.files['data/pipeline.json'] += ' ';
    assert.equal(verifyArtifact(packaged), false);

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
