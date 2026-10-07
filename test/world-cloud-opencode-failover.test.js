'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const runner = require('../scripts/world-cloud-opencode-failover.cjs');

test('provider/transient failures are distinguished from real agent failures', () => {
  for (const text of [
    'Provider returned error',
    'UnknownError: Unexpected server error',
    'HTTP 429 rate limit',
    'endpoint temporarily unavailable',
    'connection reset',
  ]) assert.equal(runner.isTransientProviderFailure(text), true, text);
  assert.equal(runner.isTransientProviderFailure('SyntaxError in project source'), false);
});

test('generated OpenCode config references the secret only through env', () => {
  const cfg = runner.buildConfig('z-ai/glm-5.2:free');
  assert.equal(cfg.provider.worldrouter.options.apiKey, '{env:OPENROUTER_API_KEY}');
  assert.ok(cfg.provider.worldrouter.models['z-ai/glm-5.2:free']);
  assert.ok(!JSON.stringify(cfg).includes('sk-or-'));
});
test('transient provider failure automatically falls through to the next free model', () => {
  const seen = [];
  let resets = 0;
  const result = runner.runWithFailover('test prompt', {
    models: ['model-a:free', 'model-b:free'],
    resetFn: () => { resets += 1; },
    runOneFn: (modelId) => {
      seen.push(modelId);
      if (modelId === 'model-a:free') return { modelId, status: 1, stdout: '', stderr: 'Provider returned error', error: null };
      return { modelId, status: 0, stdout: 'ok', stderr: '', error: null, configPath: 'mock-config.json' };
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.modelId, 'model-b:free');
  assert.deepEqual(seen, ['model-a:free', 'model-b:free']);
  assert.equal(resets, 1);
});

test('non-provider agent failure stops immediately instead of hiding a real defect', () => {
  let calls = 0;
  const result = runner.runWithFailover('test prompt', {
    models: ['model-a:free', 'model-b:free'],
    resetFn: () => {},
    runOneFn: (modelId) => { calls += 1; return { modelId, status: 1, stdout: '', stderr: 'SyntaxError in edited project', error: null }; },
  });
  assert.equal(result.result, 'AGENT_FAIL');
  assert.equal(calls, 1);
});
