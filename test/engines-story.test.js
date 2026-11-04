'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStoryBible, validateStoryBible } = require('../lib/engines/dramaturgy.cjs');
const { createScenario, validateScenario, completeScenario } = require('../lib/engines/story.cjs');
const gameCard = { id: 'story-game', genre: 'adventure', startLocation: 'берег',
  world_laws: ['ночью вода поднимается'] };
function fixture(seed = 42, recentGames = []) {
  const storyBible = createStoryBible({ gameCard, randomSeed: seed, recentGames });
  return { storyBible, gameCard, randomSeed: seed, recentGames };
}
test('a validated StoryBible produces deterministic scenes, witnesses, choices and reveal events', () => {
  const args = fixture();
  const a = createScenario(args);
  assert.deepEqual(a, createScenario(args));
  assert.deepEqual(validateScenario(a), { ok: true, errors: [] });
  assert.equal(a.scenes.length, 6);
  assert.equal(a.dialogues.every(d => d.menuOnly), true);
  assert.equal(a.choices.every(c => c.menuOnly && c.options[0].traceDelta), true);
  assert.equal(a.historyEntry, null);
  assert.equal(a.selectedEnding, null);
  assert.equal(a.suspects.length, 2);
  assert.equal(a.twists.length, 2);
  assert.equal(a.events.filter(e => e.action === 'reveal_twist').length, 2);
});
test('every clue can be verified before its twist and every ending has trace requirements', () => {
  const result = createScenario(fixture(17));
  for (const twist of result.twists) {
    const sceneIndex = result.scenes.findIndex(s => s.id === twist.revealScene);
    assert.equal(twist.clueIds.length >= 2 && twist.clueIds.length <= 3, true);
    for (const id of twist.clueIds) {
      const clue = result.clues.find(c => c.id === id);
      assert.ok(clue.test);
      assert.ok(result.scenes.findIndex(s => s.id === clue.scene) < sceneIndex);
    }
  }
  assert.equal(result.endings.length >= 2, true);
  assert.equal(result.endings.every(e => Object.values(e.traceConditions).includes(1)), true);
});
test('completion is gated by actual player traces; never writes history beforehand', () => {
  const result = createScenario(fixture(90));
  const ending = result.endings[1];
  assert.throws(() => completeScenario(result, { endingId: ending.id, traces: {} }), /condition/);
  assert.throws(() => completeScenario(result, { endingId: 'fake', traces: {} }), /Unknown/);
  assert.throws(() => completeScenario(result, { endingId: ending.id, traces: { доверие: -1 } }), /nonnegative/);
  const key = Object.keys(ending.traceConditions)[0];
  const finished = completeScenario(result, { endingId: ending.id, traces: { [key]: 1 } });
  assert.equal(finished.historyEntry.endingType, ending.type);
  assert.equal(finished.historyEntry.finalLocation, ending.finalLocation);
  assert.equal(finished.selectedEnding, ending.id);
  assert.equal(result.historyEntry, null);
  assert.throws(() => completeScenario(finished, { endingId: ending.id, traces: { [key]: 1 } }), /already completed/);
});
test('invalid story, mismatched seed or late evidence never yield a scenario', () => {
  const args = fixture(61);
  assert.throws(() => createScenario({ ...args, randomSeed: 62 }), /seed mismatch/);
  assert.throws(() => createScenario({ ...args, randomSeed: 1.5 }), /safe integer/);
  assert.throws(() => createScenario({ ...args, storyBible: { ...args.storyBible, repair: null } }), /Invalid StoryBible/);
  const result = createScenario(args);
  const corrupted = JSON.parse(JSON.stringify(result));
  corrupted.clues[0].scene = 's6';
  assert.equal(validateScenario(corrupted).ok, false);
});
test('recent-game history feeds the contract without mutating prior games', () => {
  const first = fixture(8);
  const completed = completeScenario(createScenario(first), {
    endingId: 'ending-0', traces: { [first.storyBible.endings[0].trace]: 1 }
  });
  const history = [completed.historyEntry];
  const snapshot = JSON.stringify(history);
  const next = createScenario(fixture(9, history));
  assert.notEqual(next.primaryConflict, completed.historyEntry.primaryConflict);
  assert.notEqual(next.twist.type, completed.historyEntry.twistType);
  assert.equal(JSON.stringify(history), snapshot);
});

test('completion preserves both twist cooldowns, hero variation and seed', () => {
  const args = fixture(8);
  const result = createScenario(args);
  const done = completeScenario(result, { endingId: 'ending-0', traces: { доверие: 1 } });
  assert.deepEqual(done.historyEntry.twists.map(t => t.type), args.storyBible.twists.map(t => t.type));
  assert.equal(done.historyEntry.heroArc, args.storyBible.heroArc);
  assert.equal(done.historyEntry.heroHappiness, args.storyBible.heroHappiness);
  assert.equal(done.historyEntry.randomSeed, args.storyBible.randomSeed);
  done.historyEntry.twists[0].type = 'changed';
  assert.equal(result.twists[0].type, args.storyBible.twists[0].type);
  const unchanged = completeScenario(result, { endingId: 'ending-0', traces: { доверие: 1 } });
  const next = fixture(3, [unchanged.historyEntry]).storyBible;
  assert.equal(next.twists.some(t => args.storyBible.twists.some(old => old.type === t.type)), false);
});

test('all selectable endings exclude the previous actual ending type and place', () => {
  const first = fixture(8);
  const previous = completeScenario(createScenario(first), {
    endingId: 'ending-1', traces: { [first.storyBible.endings[1].trace]: 1 }
  }).historyEntry;
  for (let seed = 0; seed < 40; seed++) {
    const next = fixture(seed, [previous]).storyBible;
    for (const ending of next.endings) {
      assert.notEqual(ending.type, previous.endingType, 'repeated ending type at seed ' + seed);
      assert.notEqual(ending.finalLocation, previous.finalLocation, 'repeated ending place at seed ' + seed);
    }
    for (const field of ['type', 'finalLocation']) {
      const corrupted = structuredClone(next);
      corrupted.endings[1][field] = field === 'type' ? previous.endingType : previous.finalLocation;
      assert.equal(validateStoryBible(corrupted, [previous]).ok, false);
    }
  }
});

test('completed alternative-ending cycles retain three-game twist and conflict cooldowns', () => {
  const history = [];
  for (let seed = 0; seed < 8; seed++) {
    const before = JSON.stringify(history);
    const args = fixture(seed, history);
    const scenario = createScenario(args);
    assert.equal(JSON.stringify(history), before);
    for (const previous of history.slice(-3)) {
      assert.notEqual(scenario.primaryConflict, previous.primaryConflict);
      assert.equal(scenario.twists.some(t => previous.twists.some(old => old.type === t.type)), false);
    }
    if (history.length) {
      assert.notEqual(args.storyBible.heroArc, history.at(-1).heroArc);
      assert.notEqual(args.storyBible.heroHappiness, history.at(-1).heroHappiness);
    }
    const selected = scenario.endings[seed % scenario.endings.length];
    const key = Object.keys(selected.traceConditions)[0];
    const done = completeScenario(scenario, { endingId: selected.id, traces: { [key]: 1 } });
    if (history.length) {
      assert.notEqual(done.historyEntry.endingType, history.at(-1).endingType);
      assert.notEqual(done.historyEntry.finalLocation, history.at(-1).finalLocation);
    }
    history.push(done.historyEntry);
  }
});
