'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../lib/world-consequence-engine');
const AI = require('../lib/genie-ai');
const world = () => E.createWorld('genie-openai-integration');
const input = (extra = {}) => ({
  engine: E, world: world(), structure: 'solar', text: 'Построить солнечную станцию',
  actorId: 'test-user', apiKey: 'test-key', now: 1000000, ...extra
});
test('status is read-only and never returns the secret', () => {
  assert.deepEqual(AI.status(''), { configured: false, provider: 'openai', mode: 'explicit-read-only' });
  assert.equal(AI.status('sk-proj-private').configured, true);
  assert.doesNotMatch(JSON.stringify(AI.status('sk-proj-private')), /private/);
});
test('no key, unknown project and oversized comments never reach provider', async () => {
  let calls = 0;
  const fetcher = async () => { calls++; throw Error('should not call'); };
  await assert.rejects(AI.narrate(input({ actorId: 'missing', apiKey: '', fetcher })), { status: 503 });
  await assert.rejects(AI.narrate(input({ actorId: 'invalid', structure: '__proto__', fetcher })), { status: 400 });
  await assert.rejects(AI.narrate(input({ actorId: 'large', text: 'x'.repeat(601), fetcher })), { status: 400 });
  assert.equal(calls, 0);
});
test('explicit read-only AI narration sends only allowlisted world data and preserves simulation', async () => {
  const w = world(), before = structuredClone(w);
  let calls = 0;
  const fetcher = async (url, init) => {
    calls++;
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(init.method, 'POST');
    const request = JSON.parse(init.body);
    assert.equal(request.model, 'gpt-4.1-mini');
    assert.equal(request.store, false);
    assert.equal(request.max_output_tokens, 240);
    assert.equal(request.input[1].role, 'user');
    const scenario = JSON.parse(request.input[1].content);
    assert.equal(scenario.selectedProject, 'solar');
    assert.equal(scenario.exactSimulation.cost, 40);
    assert.equal('residents' in scenario, false);
    assert.equal('history' in scenario, false);
    assert.equal('auth' in scenario, false);
    return { ok: true, json: async () => ({
      output: [{ type: 'message', content: [{ type: 'output_text', text: 'Станция строится два хода; энергия появится позже.' }] }]
    }) };
  };
  const result = await AI.narrate(input({ world: w, actorId: 'success', fetcher }));
  assert.equal(calls, 1);
  assert.equal(result.source, 'openai');
  assert.equal(result.simulation.cost, 40);
  assert.match(result.narrative, /Станция/);
  assert.deepEqual(w, before);
});
test('30-second user cooldown and provider failure use bounded errors', async () => {
  const fetcher = async () => ({ ok: true, json: async () => ({
    output: [{ content: [{ type: 'output_text', text: 'Последствия.' }] }]
  }) });
  await AI.narrate(input({ actorId: 'cooldown', fetcher }));
  await assert.rejects(AI.narrate(input({ actorId: 'cooldown', fetcher, now: 1000001 })), { status: 429 });
  await assert.rejects(AI.narrate(input({ actorId: 'failure', fetcher: async () => ({ ok: false }) })), { status: 503 });
});
