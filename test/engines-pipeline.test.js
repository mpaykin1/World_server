'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { SEQUENCE, REQUIRED, runPipeline } = require('../lib/engines/pipeline.cjs');
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
