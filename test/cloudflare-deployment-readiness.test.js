'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { awaitDeploymentReadiness } = require('../scripts/verify-cloudflare-stack.cjs');
const mock = (status, body = null) => ({ response: { ok: status >= 200 && status < 300, status },
  text: status === 200 ? 'x'.repeat(130) : '', body });
test('transient 404 after Wrangler deploy retries until exact SHA propagates', async () => {
  let homeCount = 0, waits = 0;
  const tries = await awaitDeploymentReadiness('https://preview.invalid', 'sha123', {
    attempts: 6, sleep: async () => { waits++; },
    requestFn: async (_origin, path) => {
      if (path === '/') return ++homeCount < 3 ? mock(404) : mock(200);
      return mock(200, { deployedRevision: 'sha123', configured: true });
    }
  });
  assert.equal(tries, 3);
  assert.equal(waits, 2);
  assert.equal(homeCount, 3);
});
test('stale config revision retries; never approves a different SHA', async () => {
  let configCalls = 0;
  const n = await awaitDeploymentReadiness('https://preview.invalid', 'new', {
    attempts: 5, sleep: async () => {},
    requestFn: async (_origin, path) => path === '/'
      ? mock(200) : mock(200, { deployedRevision: ++configCalls < 3 ? 'old' : 'new' })
  });
  assert.equal(n, 3);
});
test('401 / permission errors fail immediately rather than waiting', async () => {
  let waits = 0;
  await assert.rejects(awaitDeploymentReadiness('https://preview.invalid', 'new', {
    attempts: 10, sleep: async () => { waits++; }, requestFn: async () => mock(403)
  }), /readiness failed: HTTP 403/);
  assert.equal(waits, 0);
});
test('failed propagation exhausts a bounded deadline rather than false-green', async () => {
  let calls = 0, waits = 0;
  await assert.rejects(awaitDeploymentReadiness('https://preview.invalid', 'sha123', {
    attempts: 3, sleep: async () => { waits++; },
    requestFn: async () => { calls++; return mock(404); }
  }), /did not propagate expected SHA/);
  assert.equal(calls, 3);
  assert.equal(waits, 2);
});
