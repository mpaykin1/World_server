'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../scripts/distributed-cas.cjs');

async function withServer(token, fn) {
  const s = server({ host: '127.0.0.1', port: 0, token });
  await new Promise((resolve) => s.on('listening', resolve));
  const { port } = s.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve) => s.close(resolve));
  }
}

test('distributed CAS exposes authenticated health contract', async () => {
  await withServer('secret-token', async (base) => {
    const denied = await fetch(`${base}/health`);
    assert.equal(denied.status, 401);

    const ok = await fetch(`${base}/health`, {
      headers: { authorization: 'Bearer secret-token' },
    });
    assert.equal(ok.status, 200);
    const body = await ok.json();
    assert.equal(body.ok, true);
    assert.equal(body.protocol, 'world-server-cas-http-v1');
    assert.equal(body.localCasReady, true);
  });
});