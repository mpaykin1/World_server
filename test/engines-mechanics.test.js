'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuleSet, createMechanicsState, advanceMechanics, finishMechanics } = require('../lib/engines/mechanics.cjs');
const scenario = {
  gameId: 'real-rules', scenes: [{ id: 'intro' }, { id: 'reveal' }, { id: 'ending' }],
  clues: [{ id: 'letter', scene: 'intro' }],
  events: [
    { id: 'investigate', scene: 'intro', action: 'inspect' },
    { id: 'truth', scene: 'reveal', action: 'reveal_twist', prerequisiteClues: ['letter'] }
  ],
  choices: [
    { id: 'truth-choice', type: 'правду или скрыть', scene: 'intro', options: [
      { id: 'tell', traceDelta: { правда: 1 } }, { id: 'hide', traceDelta: {} }
    ] },
    { id: 'trust-choice', type: 'доверить или нет', scene: 'reveal', options: [
      { id: 'trust', traceDelta: { доверие: 1 } }, { id: 'decline', traceDelta: {} }
    ] }
  ],
  endings: [
    { id: 'reveal-ending', type: 'счастливая', scene: 'ending', traceConditions: { правда: 1 } },
    { id: 'trust-ending', type: 'неоднозначная', scene: 'ending', traceConditions: { доверие: 1 } }
  ]
};
test('rules are deterministic and scenario-specific without inventing foes', () => {
  const a = createRuleSet({ scenario, genre: 'adventure' });
  assert.deepEqual(a, createRuleSet({ scenario, genre: 'adventure' }));
  assert.equal(a.events[1].prerequisiteClues[0], 'letter');
  assert.equal(a.weapons.length, 0);
  assert.equal(a.foes.length, 0);
  assert.deepEqual(Object.keys(a.loop).sort(),
    ['goal', 'action', 'risk', 'result', 'consequence', 'growth'].sort());
});
test('scene progression, evidence and choices have real consequences', () => {
  const ruleSet = createRuleSet({ scenario, genre: 'story' });
  let state = createMechanicsState(ruleSet);
  assert.throws(() => advanceMechanics(ruleSet, state, { type: 'enter', sceneId: 'reveal' }), /order/);
  state = advanceMechanics(ruleSet, state, { type: 'enter', sceneId: 'intro' });
  assert.deepEqual(state.collectedClues, ['letter']);
  assert.throws(() => advanceMechanics(ruleSet, state, { type: 'enter', sceneId: 'reveal' }), /unresolved/);
  state = advanceMechanics(ruleSet, state, { type: 'choose', choiceId: 'truth-choice', optionId: 'tell' });
  assert.equal(state.traces.правда, 1);
  assert.throws(() => advanceMechanics(ruleSet, state, { type: 'choose', choiceId: 'truth-choice', optionId: 'tell' }), /already/);
  state = advanceMechanics(ruleSet, state, { type: 'enter', sceneId: 'reveal' });
  assert.ok(state.triggeredEvents.includes('truth'));
  state = advanceMechanics(ruleSet, state, { type: 'choose', choiceId: 'trust-choice', optionId: 'decline' });
  state = advanceMechanics(ruleSet, state, { type: 'enter', sceneId: 'ending' });
  assert.throws(() => finishMechanics(ruleSet, state, 'trust-ending'), /not earned/);
  const final = finishMechanics(ruleSet, state, 'reveal-ending');
  assert.equal(final.ended, 'reveal-ending');
  assert.equal(state.ended, null);
});
test('unknown references, malformed deltas and missing endings fail closed', () => {
  const copy = x => JSON.parse(JSON.stringify(x));
  const ghost = copy(scenario); ghost.events[1].prerequisiteClues = ['missing'];
  assert.throws(() => createRuleSet({ scenario: ghost, genre: 'adventure' }), /unknown clues/);
  const outOfWorld = copy(scenario); outOfWorld.choices[0].scene = 'not-a-scene';
  assert.throws(() => createRuleSet({ scenario: outOfWorld, genre: 'adventure' }), /scene is unknown/);
  const cheating = copy(scenario); cheating.choices[0].options[0].traceDelta = { правда: 100 };
  assert.throws(() => createRuleSet({ scenario: cheating, genre: 'adventure' }), /invalid player consequence/);
  assert.throws(() => createRuleSet({ scenario, genre: '' }), /genre/);
});
test('mechanics engine never mutates the input scenario', () => {
  const snapshot = JSON.stringify(scenario);
  const rules = createRuleSet({ scenario, genre: 'adventure' });
  const state = advanceMechanics(rules, createMechanicsState(rules), { type: 'enter', sceneId: 'intro' });
  assert.equal(state.currentScene, 'intro');
  assert.equal(JSON.stringify(scenario), snapshot);
});
