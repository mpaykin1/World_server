'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createCoreAdapters, runCorePipeline } = require('../lib/engines/core-adapters.cjs');

const gameCard = {
  id: 'engine-demo', genre: 'adventure', short: true, startLocation: 'bridge',
  engines_enabled: ['dramaturgy', 'story', 'mechanics', 'physics', 'visual', 'onboarding'],
  controls: { keyboard: ['WASD', 'Space'], touch: ['swipe', 'tap'] }
};
function realConsumerAdapters() {
  return {
    story({ outputs }) {
      assert.equal(outputs.dramaturgy.gameId, gameCard.id);
      assert.ok(outputs.dramaturgy.twists.every(t => t.clues.length >= 2));
      return { value: { scenes: [{ id: 'scene-1' }] } };
    },
    mechanics({ outputs }) {
      assert.equal(outputs.story.scenes.length, 1);
      return { value: { loop: { action: 'jump' } } };
    },
    physics() { return { value: { gravity: 9.8, collisions: true } }; },
    visual() { return { value: { ui_icons: ['move', 'jump'] } }; }
  };
}
test('runs existing dramaturgy and onboarding over real pipeline outputs', () => {
  const options = { gameCard, randomSeed: 42, adapters: realConsumerAdapters() };
  const a = runCorePipeline(options);
  const b = runCorePipeline(options);
  assert.deepEqual(a, b);
  assert.deepEqual(a.errors, []);
  assert.equal(a.steps[0].status, 'skipped_optional');
  assert.equal(a.steps.filter(x => x.status === 'produced_unverified').length, 6);
  assert.equal(a.steps.every(x => x.ok === false), true);
  assert.equal(a.outputs.dramaturgy.conflicts.length, 4);
  assert.equal(a.outputs.dramaturgy.endings.length >= 2, true);
  assert.deepEqual(a.outputs.onboarding.steps.map(s => s.icon), ['move', 'jump']);
  assert.equal(a.outputs.onboarding.textPlacement, 'pause_menu_only');
});
test('missing consumer adapters block immediately, not fake complete', () => {
  const r = runCorePipeline({ gameCard, randomSeed: 42 });
  assert.deepEqual(r.errors, [{
    engine: 'story', code: 'ENGINE_UNAVAILABLE', message: 'No adapter for story'
  }]);
  assert.equal(r.steps.at(-1).status, 'blocked');
  assert.equal(r.outputs.onboarding, undefined);
  assert.equal(r.outputs.dramaturgy.twists.length, 2);
});
test('onboarding requires actual compatible input and cannot invent UI controls', () => {
  const r = runCorePipeline({
    gameCard: { ...gameCard, controls: undefined },
    randomSeed: 42, adapters: realConsumerAdapters()
  });
  assert.equal(r.errors.length, 1);
  assert.equal(r.errors[0].engine, 'onboarding');
  assert.equal(r.errors[0].code, 'ENGINE_FAILED');
  assert.match(r.errors[0].message, /controls/);
  assert.equal(r.outputs.onboarding, undefined);
});
test('no foreign engine overrides or unauthorized adapter IDs', () => {
  assert.throws(() => createCoreAdapters({ dramaturgy() {} }), /external adapters/);
  assert.throws(() => createCoreAdapters({ onboarding() {} }), /external adapters/);
  assert.throws(() => createCoreAdapters({ unknown() {} }), /external adapters/);
  assert.throws(() => createCoreAdapters({ story: null }), /external adapters/);
});

test('evidence-comparison from real scenario becomes graphic interact cue without changing event ID', () => {
  const adapters = {
    ...realConsumerAdapters(),
    mechanics() { return { value: { loop: { action: 'compare_evidence' } } }; },
    visual() { return { value: { ui_icons: ['move', 'interact'] } }; }
  };
  const result = runCorePipeline({ gameCard, randomSeed: 42, adapters });
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.outputs.onboarding.steps.map(step => step.icon), ['move', 'interact']);
  assert.equal(result.outputs.onboarding.steps.at(-1).completeOn, 'compare_evidence');
  assert.equal(result.outputs.mechanics.loop.action, 'compare_evidence');
});
