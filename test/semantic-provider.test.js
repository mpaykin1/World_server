'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { interpretBlueprint, interpretWorldSpec, workerConfigured } = require('../lib/semantic-provider');

function withWorkerEnv(url, timeoutMs, fn) {
  const prevUrl = process.env.SEMANTIC_AI_WORKER_URL;
  const prevTimeout = process.env.SEMANTIC_AI_WORKER_TIMEOUT_MS;
  process.env.SEMANTIC_AI_WORKER_URL = url;
  if (timeoutMs !== undefined) process.env.SEMANTIC_AI_WORKER_TIMEOUT_MS = String(timeoutMs);
  return Promise.resolve(fn()).finally(() => {
    if (prevUrl === undefined) delete process.env.SEMANTIC_AI_WORKER_URL; else process.env.SEMANTIC_AI_WORKER_URL = prevUrl;
    if (prevTimeout === undefined) delete process.env.SEMANTIC_AI_WORKER_TIMEOUT_MS; else process.env.SEMANTIC_AI_WORKER_TIMEOUT_MS = prevTimeout;
  });
}

test('workerConfigured is false when no worker URL is set (the default, free-only state today)', async () => {
  await withWorkerEnv('', undefined, () => {
    assert.equal(workerConfigured(), false);
  });
});

test('interpretBlueprint falls back to the deterministic generator when no worker is configured', async () => {
  await withWorkerEnv('', undefined, async () => {
    const { blueprint, provider } = await interpretBlueprint({ story: 'hi', format: 'game' });
    assert.equal(provider, 'deterministic');
    assert.equal(blueprint.mode, 'Игра');
  });
});

test('interpretBlueprint falls back to deterministic when the configured worker is unreachable', async () => {
  await withWorkerEnv('http://127.0.0.1:1', 200, async () => {
    const { blueprint, provider } = await interpretBlueprint({ story: 'hi' });
    assert.equal(provider, 'deterministic');
    assert.ok(blueprint.title);
  });
});

test('interpretBlueprint falls back to deterministic when the worker times out', async () => {
  const server = require('node:http').createServer(() => {}); // never responds
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await withWorkerEnv(`http://127.0.0.1:${port}`, 100, async () => {
    const { provider } = await interpretBlueprint({ story: 'hi' });
    assert.equal(provider, 'deterministic');
  });
  await new Promise((resolve) => server.close(resolve));
});

test('interpretBlueprint uses the worker result when it responds with a valid blueprint', async () => {
  const http = require('node:http');
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ title: 'AI Title', mode: 'AI Mode', scene: 'AI Scene' }));
    });
  });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await withWorkerEnv(`http://127.0.0.1:${port}`, 2000, async () => {
    const { blueprint, provider } = await interpretBlueprint({ story: 'hi' });
    assert.equal(provider, 'ai');
    assert.equal(blueprint.title, 'AI Title');
    assert.equal(blueprint.scene, 'AI Scene');
  });
  await new Promise((resolve) => server.close(resolve));
});

test('interpretBlueprint falls back to deterministic when the worker returns a malformed response', async () => {
  const http = require('node:http');
  const server = http.createServer((req, res) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ok: true })); });
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;
  await withWorkerEnv(`http://127.0.0.1:${port}`, 2000, async () => {
    const { provider } = await interpretBlueprint({ story: 'hi' });
    assert.equal(provider, 'deterministic');
  });
  await new Promise((resolve) => server.close(resolve));
});

test('interpretWorldSpec falls back to buildWorldSpec when no worker is configured', async () => {
  await withWorkerEnv('', undefined, async () => {
    const { spec, provider } = await interpretWorldSpec({ id: 's1', answers: { chars: [{ name: 'Hero' }] }, blueprint: { title: 'T', mode: '', scene: 'S' } });
    assert.equal(provider, 'deterministic');
    assert.equal(spec.characters[0].name, 'Hero');
  });
});
