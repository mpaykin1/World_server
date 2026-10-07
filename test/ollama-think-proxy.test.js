'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Regression guard for a real bug: Node's http.Server defaults to
// requestTimeout=300000ms/headersTimeout=60000ms (since Node 18), which
// silently force-closed proxy connections for tool-calling turns that were
// genuinely completing but took >5 minutes under real CPU contention -
// surfacing on AnythingLLM's side as "[AIbitat] Provider error: fetch failed",
// indistinguishable from a real network failure. See error-prevention-
// registry.json#ollama-think-proxy-default-request-timeout.
test('the proxy server disables Node default request/headers timeouts', () => {
  // Use a fresh port so this doesn't collide with a live proxy instance.
  process.env.OLLAMA_THINK_PROXY_PORT = '0';
  delete require.cache[require.resolve('../scripts/ollama-think-proxy.cjs')];
  const { server } = require('../scripts/ollama-think-proxy.cjs');
  try {
    assert.equal(server.requestTimeout, 0);
    assert.equal(server.headersTimeout, 0);
    assert.equal(server.timeout, 0);
  } finally {
    server.close();
  }
});
