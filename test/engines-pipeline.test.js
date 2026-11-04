'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SEQUENCE, REQUIRED, runPipeline } = require('../lib/engines/pipeline.cjs');
const { createStoryBible, validateStoryBible } = require('../lib/engines/dramaturgy.cjs');
const gameCard = {
  id: 'new-game', genre: 'adventure',
  engines_enabled: ['dramaturgy', 'story', 'mechanics', 'physics', 'visual', 'onboarding']
};
function adapters(trace) {
  return Object.fromEntries(REQUIRED.map(engine => [engine, ({ gameCard, randomSeed, outputs }) => {
    trace.push(engine);
    assert.equal(gameCard.id, 'new-game');
    assert.equal(randomSeed, 42);
    if (engine === 'story') assert.equal(outputs.dramaturgy.engine, 'dramaturgy');
    return { value: { engine }, out_ref: 'artifact/' + engine };
  }]));
}
test('executes required engines in contract order without calc', () => {
  const trace = [];
  const result = runPipeline({ gameCard, randomSeed: 42, adapters: adapters(trace) });
  assert.deepEqual(trace, REQUIRED);
  assert.deepEqual(result.steps.map(s => s.engine), SEQUENCE);
  assert.equal(result.steps[0].status, 'skipped_optional');
  assert.equal(result.errors.length, 0);
  assert.equal(result.steps.at(-1).out_ref, 'artifact/onboarding');
  assert.equal(result.steps.at(-1).ok, false); // no false claim of G4 integration
  assert.equal(result.generated_at, null);
});
test('optional calc runs before dramaturgy when requested', () => {
  const trace = [];
  const input = { ...gameCard, engines_enabled: ['calc', ...gameCard.engines_enabled] };
  const registry = adapters(trace);
  registry.calc = () => { trace.push('calc'); return { value: { traits: [] } }; };
  const result = runPipeline({ gameCard: input, randomSeed: 42, adapters: registry });
  assert.deepEqual(trace, SEQUENCE);
  assert.equal(result.steps[0].status, 'produced_unverified');
  assert.equal(result.steps[0].out_ref, null);
});
test('same seed and adapters produce deterministic pipeline state', () => {
  const first = runPipeline({ gameCard, randomSeed: 42, adapters: adapters([]) });
  const second = runPipeline({ gameCard, randomSeed: 42, adapters: adapters([]) });
  assert.deepEqual(first, second);
});
test('missing or throwing required engine stops chain and records precise failure', () => {
  const a = adapters([]);
  delete a.mechanics;
  const noEngine = runPipeline({ gameCard, randomSeed: 42, adapters: a });
  assert.equal(noEngine.errors[0].code, 'ENGINE_UNAVAILABLE');
  assert.equal(noEngine.errors[0].engine, 'mechanics');
  assert.equal(noEngine.steps.at(-1).status, 'blocked');
  assert.equal(noEngine.steps.some(s => s.engine === 'physics'), false);
  const b = adapters([]);
  b.story = () => { throw new Error('bad clue'); };
  const broken = runPipeline({ gameCard, randomSeed: 42, adapters: b });
  assert.deepEqual(broken.errors, [{ engine: 'story', code: 'ENGINE_FAILED', message: 'bad clue' }]);
  assert.equal(broken.steps.at(-1).status, 'failed');
});
test('invalid input fails closed and never fabricates output reference', () => {
  assert.throws(() => runPipeline({ gameCard: { ...gameCard, engines_enabled: [] }, randomSeed: 42 }), /missing required/);
  assert.throws(() => runPipeline({ gameCard, randomSeed: null }), /randomSeed/);
  assert.throws(() => runPipeline({ gameCard, randomSeed: 42, recentGames: {} }), /recentGames/);
  assert.throws(() => runPipeline({ gameCard, randomSeed: 42, timestamp: 'not a date' }), /timestamp/);
  const a = adapters([]);
  a.dramaturgy = () => ({ value: { ok: true } });
  const res = runPipeline({ gameCard, randomSeed: 42, adapters: a });
  assert.equal(res.steps[1].out_ref, null);
  assert.equal(res.steps[1].ok, false);
});

test('requested optional calc can decline a profile without blocking required engines', () => {
  const trace = [];
  const registry = adapters(trace);
  registry.calc = () => ({ value: null, out_ref: 'not-a-profile' });
  registry.dramaturgy = ({ outputs }) => {
    assert.equal(outputs.calc, null);
    trace.push('dramaturgy');
    return { value: { engine: 'dramaturgy' } };
  };
  const result = runPipeline({
    gameCard: { ...gameCard, engines_enabled: ['calc', ...REQUIRED] },
    randomSeed: 42, adapters: registry
  });
  assert.deepEqual(trace, REQUIRED);
  assert.deepEqual(result.errors, []);
  assert.equal(result.outputs.calc, null);
  assert.equal(result.steps[0].status, 'skipped_optional');
  assert.equal(result.steps[0].out_ref, null);
  assert.equal(result.steps[0].ok, false);
});

test('adapter edits cannot rewrite caller data or the next stage inputs', () => {
  const card = structuredClone(gameCard);
  card.characters = [{ name: 'original' }];
  const history = [{ primaryConflict: 'original', decisions: { ending: 'original' } }];
  const original = structuredClone({ card, history });
  const registry = adapters([]);
  registry.dramaturgy = ({ gameCard, recentGames }) => {
    gameCard.id = 'corrupted';
    gameCard.engines_enabled.length = 0;
    gameCard.characters[0].name = 'corrupted';
    recentGames[0].decisions.ending = 'corrupted';
    recentGames.push({ primaryConflict: 'invented' });
    return { value: { engine: 'dramaturgy' } };
  };
  registry.story = ({ gameCard, recentGames }) => {
    assert.deepEqual(gameCard, original.card);
    assert.deepEqual(recentGames, original.history);
    return { value: { engine: 'story' } };
  };
  const result = runPipeline({ gameCard: card, recentGames: history, randomSeed: 42, adapters: registry });
  assert.deepEqual(result.errors, []);
  assert.equal(result.gameId, 'new-game');
  assert.deepEqual(result.steps.map(s => s.engine), SEQUENCE);
  assert.deepEqual({ card, history }, original);
});

test('later adapters cannot change previous outputs or retained producer references', () => {
  const produced = { engine: 'dramaturgy', clues: [{ id: 'original' }] };
  const registry = adapters([]);
  registry.dramaturgy = () => ({ value: produced });
  registry.story = ({ outputs }) => {
    outputs.dramaturgy.clues[0].id = 'changed-by-story';
    return { value: { engine: 'story', clues: outputs.dramaturgy.clues } };
  };
  registry.mechanics = ({ outputs }) => {
    produced.clues[0].id = 'changed-by-producer';
    outputs.story.clues[0].id = 'changed-by-mechanics';
    return { value: { engine: 'mechanics' } };
  };
  const result = runPipeline({ gameCard, randomSeed: 42, adapters: registry });
  assert.deepEqual(result.errors, []);
  assert.equal(result.outputs.dramaturgy.clues[0].id, 'original');
  assert.equal(result.outputs.story.clues[0].id, 'changed-by-story');
  produced.clues.length = 0;
  assert.equal(result.outputs.dramaturgy.clues.length, 1);
});

test('failing adapter cannot corrupt caller history or earlier stage output', () => {
  const history = [{ primaryConflict: 'original' }];
  const registry = adapters([]);
  registry.story = ({ outputs, recentGames }) => {
    outputs.dramaturgy.engine = 'corrupted';
    recentGames.length = 0;
    throw new Error('stage failure');
  };
  const result = runPipeline({ gameCard, recentGames: history, randomSeed: 42, adapters: registry });
  assert.equal(result.errors[0].engine, 'story');
  assert.equal(result.errors[0].message, 'stage failure');
  assert.equal(result.outputs.dramaturgy.engine, 'dramaturgy');
  assert.deepEqual(history, [{ primaryConflict: 'original' }]);
});

test('mandatory null and noncloneable results stop before subsequent engines', () => {
  for (const value of [null, { callback() {} }]) {
    const trace = [];
    const registry = adapters(trace);
    registry.story = () => ({ value });
    const result = runPipeline({ gameCard, randomSeed: 42, adapters: registry });
    assert.equal(result.errors[0].code, 'ENGINE_FAILED');
    assert.equal(result.errors[0].engine, 'story');
    assert.equal(result.steps.at(-1).status, 'failed');
    assert.equal(Object.hasOwn(result.outputs, 'story'), false);
    assert.deepEqual(trace, ['dramaturgy']);
  }
});

test('real dramaturgy stays reproducible and valid after a downstream history edit', () => {
  const history = [createStoryBible({ gameCard, randomSeed: 'previous' })];
  const original = structuredClone(history);
  const registry = adapters([]);
  registry.dramaturgy = context => ({ value: createStoryBible(context) });
  registry.story = ({ outputs, recentGames }) => {
    recentGames.splice(0);
    outputs.dramaturgy.primaryConflict = 'not-a-conflict';
    return { value: { engine: 'story' } };
  };
  const options = { gameCard, recentGames: history, randomSeed: 42, adapters: registry };
  const first = runPipeline(options);
  const second = runPipeline(options);
  assert.deepEqual(first.errors, []);
  assert.deepEqual(first, second);
  assert.deepEqual(history, original);
  assert.deepEqual(validateStoryBible(first.outputs.dramaturgy, history), { ok: true, errors: [] });
  assert.notEqual(first.outputs.dramaturgy.primaryConflict, history[0].primaryConflict);
});
