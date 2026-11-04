'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createStoryBible } = require('../lib/engines/dramaturgy.cjs');
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
