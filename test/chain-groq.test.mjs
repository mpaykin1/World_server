import test from 'node:test';
import assert from 'node:assert/strict';
import {handleAiInterpret} from '../chain-ai-interpreter.mjs';

const origin = 'https://mpaykin1.github.io';
const proposal = JSON.stringify({
  summary: 'Появился город',
  commands: [{ action: 'create', kind: 'city', style: 'gothic', details: 'Каменные здания' }],
  unknowns: []
});
const request = provider => new Request('https://example.test/api/chain-ai', {
  method: 'POST', headers: { origin, 'content-type': 'application/json' },
  body: JSON.stringify({ text: 'Создай готический город', provider })
});
const env = () => ({
  AI: { run: async () => ({ response: proposal }) }, GROQ_API_KEY: 'fake-only-for-tests',
  GAME_AI_RATE_LIMIT: { limit: async () => ({ success: true }) }
});
test('Groq explicit provider interprets intent without executing world mutations', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(url, 'https://api.groq.com/openai/v1/chat/completions');
    assert.equal(opts.headers.authorization, 'Bearer fake-only-for-tests');
    assert.equal(JSON.parse(opts.body).model, 'llama-3.3-70b-versatile');
    return Response.json({ choices: [{ message: { content: proposal } }] });
  };
  try {
    const response = await handleAiInterpret(request('groq'), env());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.equal(body.provider, 'groq');
    assert.equal(body.executed, false);
    assert.equal(body.proposal.commands[0].kind, 'city');
  } finally { globalThis.fetch = originalFetch; }
});
test('Groq status indicates configuration without leaking token', async () => {
  const response = await handleAiInterpret(new Request('https://example.test/api/chain-ai',
    { headers: { origin } }), env());
  const body = await response.text();
  assert.equal(JSON.parse(body).providers.groq, true);
  assert.ok(!body.includes('fake-only-for-tests'));
});
test('Auto uses Groq when Workers AI fails', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: proposal } }]
  });
  try {
    const runtime = env(); runtime.AI.run = async () => { throw Error('test cloudflare error'); };
    const response = await handleAiInterpret(request('auto'), runtime);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).provider, 'groq');
  } finally { globalThis.fetch = originalFetch; }
});
test('Auto uses Gemini after Groq rate-limit error', async () => {
  const originalFetch = globalThis.fetch;
  const targets = [];
  globalThis.fetch = async url => {
    targets.push(url);
    if (String(url).includes('api.groq.com')) return new Response('{}', { status: 429 });
    return Response.json({ candidates: [{ content: { parts: [{ text: proposal }] } }] });
  };
  try {
    const runtime = env();
    runtime.AI.run = async () => { throw Error('test cloudflare error'); };
    runtime.GEMINI_API_KEY = 'dummy-key';
    const response = await handleAiInterpret(request('auto'), runtime);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).provider, 'gemini');
    assert.equal(targets.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
test('Explicit Groq fails safely when no secret, paid model, or rate guard', async () => {
  const runtime = env(); delete runtime.GROQ_API_KEY;
  let response = await handleAiInterpret(request('groq'), runtime);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).detail, 'GROQ_KEY_MISSING');
  runtime.GROQ_API_KEY = 'fake';
  runtime.GROQ_MODEL = 'paid-unknown';
  response = await handleAiInterpret(request('groq'), runtime);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).detail, 'GROQ_MODEL_NOT_FREE_ALLOWLISTED');
  delete runtime.GAME_AI_RATE_LIMIT;
  response = await handleAiInterpret(request('groq'), runtime);
  assert.equal(response.status, 503);
  assert.equal((await response.json()).error, 'rate_limiter_unavailable');
});
test('Untrusted Groq commands cannot change unknown world objects', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => Response.json({
    choices: [{ message: { content: JSON.stringify({
      summary: 'test', commands: [{ action: 'delete_world', kind: 'city' }],
      unknowns: ['Unknown gameplay request']
    }) } }]
  });
  try {
    const response = await handleAiInterpret(request('groq'), env());
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body.proposal.commands, []);
    assert.equal(body.executed, false);
  } finally { globalThis.fetch = originalFetch; }
});
