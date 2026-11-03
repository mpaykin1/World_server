'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createOnboardingScript, initialOnboardingState,
  advanceOnboarding, currentOnboardingHint
} = require('../lib/engines/onboarding.cjs');

function input(overrides = {}) {
  return {
    ruleSet: { loop: { action: 'jump' } },
    styleSheet: { ui_icons: ['move', 'jump'] },
    controls: { keyboard: ['Space', 'WASD'], touch: ['tap', 'swipe'] },
    firstRun: true,
    ...overrides
  };
}
test('contract G1: movement then action, no on-screen text', () => {
  const script = createOnboardingScript(input());
  assert.deepEqual(script.steps, [
    { trigger: 'first_movement', icon: 'move', effect: 'pulse', completeOn: 'move' },
    { trigger: 'first_gap', icon: 'jump', effect: 'arc', completeOn: 'jump' }
  ]);
  assert.equal(script.textPlacement, 'pause_menu_only');
  assert.equal(script.skip, true);
  assert.equal(script.replay, true);
  assert.ok(script.steps.every(s => !Object.hasOwn(s, 'text')));
});
test('first-run progression, skip and replay never block controls', () => {
  const script = createOnboardingScript(input());
  const start = initialOnboardingState(script);
  assert.equal(currentOnboardingHint(script, start).icon, 'move');
  const ignored = advanceOnboarding(script, start, 'jump');
  assert.deepEqual(ignored, start);
  const moved = advanceOnboarding(script, start, 'move');
  assert.equal(currentOnboardingHint(script, moved).icon, 'jump');
  const jumped = advanceOnboarding(script, moved, 'jump');
  assert.equal(currentOnboardingHint(script, jumped), null);
  const skipped = advanceOnboarding(script, start, 'skip');
  assert.equal(skipped.skipped, true);
  assert.equal(currentOnboardingHint(script, skipped), null);
  assert.deepEqual(advanceOnboarding(script, skipped, 'replay'), start);
});
test('returning player can replay; input is not mutated', () => {
  const source = input({ firstRun: false });
  const before = JSON.stringify(source);
  const script = createOnboardingScript(source);
  assert.equal(initialOnboardingState(script).index, 2);
  const replay = advanceOnboarding(script, initialOnboardingState(script), 'replay');
  assert.equal(currentOnboardingHint(script, replay).icon, 'move');
  assert.equal(JSON.stringify(source), before);
});
test('same data always yields same script, other action changes hint', () => {
  const source = input();
  assert.deepEqual(createOnboardingScript(source), createOnboardingScript(source));
  const attack = createOnboardingScript(input({
    ruleSet: { loop: { action: 'attack' } },
    styleSheet: { ui_icons: ['attack'] }
  }));
  assert.deepEqual(attack.steps, [
    { trigger: 'first_enemy', icon: 'attack', effect: 'flash', completeOn: 'attack' }
  ]);
});
test('incorrect paths fail explicitly rather than silently constructing unusable hints', () => {
  assert.throws(() => createOnboardingScript({}), /ruleSet must be an object/);
  assert.throws(() => createOnboardingScript(input({ firstRun: null })), /firstRun/);
  assert.throws(() => createOnboardingScript(input({ controls: { keyboard: [], touch: ['tap'] } })), /controls.keyboard/);
  assert.throws(() => createOnboardingScript(input({ styleSheet: { ui_icons: ['move'] } })), /styleSheet.ui_icons must include/);
  assert.throws(() => createOnboardingScript(input({ ruleSet: { loop: { action: 'teleport' } } })), /ruleSet.loop.action/);
  const script = createOnboardingScript(input());
  assert.throws(() => advanceOnboarding(script, { index: 99 }, 'move'), /state.index/);
});
