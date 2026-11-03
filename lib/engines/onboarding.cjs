'use strict';

// Declarative, screen-text-free onboarding. Pure data; adapters decide how to render it.
// This module does not change accepted games or claim integration with them.
const ACTIONS = Object.freeze({
  jump: { trigger: 'first_gap', effect: 'arc' },
  attack: { trigger: 'first_enemy', effect: 'flash' },
  interact: { trigger: 'first_object', effect: 'pulse' },
  swim: { trigger: 'first_water', effect: 'ripple' },
  dash: { trigger: 'first_chase', effect: 'streak' },
  move: { trigger: 'first_movement', effect: 'pulse' }
});
function objectAt(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(name + ' must be an object');
  }
  return value;
}
function strings(value, name) {
  if (!Array.isArray(value) || !value.length ||
      value.some(v => typeof v !== 'string' || !v.trim())) {
    throw new TypeError(name + ' must be a non-empty string array');
  }
  return value;
}
function createOnboardingScript(input) {
  objectAt(input, 'input');
  const rules = objectAt(input.ruleSet, 'ruleSet');
  const loop = objectAt(rules.loop, 'ruleSet.loop');
  const sheet = objectAt(input.styleSheet, 'styleSheet');
  const controls = objectAt(input.controls, 'controls');
  const icons = strings(sheet.ui_icons, 'styleSheet.ui_icons');
  const keyboard = strings(controls.keyboard, 'controls.keyboard');
  const touch = strings(controls.touch, 'controls.touch');
  if (typeof input.firstRun !== 'boolean') {
    throw new TypeError('firstRun must be a boolean');
  }
  const action = loop.action;
  if (typeof action !== 'string' || !Object.hasOwn(ACTIONS, action)) {
    throw new TypeError('ruleSet.loop.action must be one of: ' + Object.keys(ACTIONS).join(', '));
  }
  if (!icons.includes(action)) {
    throw new TypeError('styleSheet.ui_icons must include action icon "' + action + '"');
  }
  const steps = [];
  const moveInputs = keyboard.some(k => /^(wasd|arrows?|arrowkeys|w|a|s|d)$/i.test(k)) &&
    touch.some(k => /^(swipe|drag|touch-move)$/i.test(k));
  if (action !== 'move' && icons.includes('move') && moveInputs) {
    steps.push({
      trigger: ACTIONS.move.trigger,
      icon: 'move',
      effect: ACTIONS.move.effect,
      completeOn: 'move'
    });
  }
  steps.push({
    trigger: ACTIONS[action].trigger,
    icon: action,
    effect: ACTIONS[action].effect,
    completeOn: action
  });
  return {
    steps,
    skip: true,
    replay: true,
    startOnFirstRun: input.firstRun,
    textPlacement: 'pause_menu_only',
    controls: { keyboard: [...keyboard], touch: [...touch] }
  };
}
function initialOnboardingState(script) {
  objectAt(script, 'script');
  if (!Array.isArray(script.steps)) throw new TypeError('script.steps must be an array');
  return {
    index: script.startOnFirstRun ? 0 : script.steps.length,
    skipped: false
  };
}
function advanceOnboarding(script, state, event) {
  objectAt(script, 'script');
  objectAt(state, 'state');
  if (!Array.isArray(script.steps)) throw new TypeError('script.steps must be an array');
  if (!Number.isSafeInteger(state.index) || state.index < 0 || state.index > script.steps.length) {
    throw new RangeError('state.index out of bounds');
  }
  if (typeof event !== 'string') throw new TypeError('event must be a string');
  if (event === 'replay') return { index: 0, skipped: false };
  if (event === 'skip') return { index: script.steps.length, skipped: true };
  const current = script.steps[state.index];
  if (current && current.completeOn === event) {
    return { index: state.index + 1, skipped: false };
  }
  return { index: state.index, skipped: Boolean(state.skipped) };
}
function currentOnboardingHint(script, state) {
  objectAt(script, 'script');
  objectAt(state, 'state');
  if (!Array.isArray(script.steps)) throw new TypeError('script.steps must be an array');
  const step = script.steps[state.index];
  return step ? { icon: step.icon, effect: step.effect, trigger: step.trigger } : null;
}
module.exports = {
  createOnboardingScript,
  initialOnboardingState,
  advanceOnboarding,
  currentOnboardingHint
};
