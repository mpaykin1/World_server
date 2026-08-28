'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const ENV_KEYS = ['POSTHOG_KEY', 'NEXT_PUBLIC_POSTHOG_KEY', 'POSTHOG_HOST', 'NEXT_PUBLIC_POSTHOG_HOST'];

function withEnv(vars, fn) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  Object.assign(process.env, vars);
  try {
    delete require.cache[require.resolve('../lib/env')];
    return fn(require('../lib/env'));
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    delete require.cache[require.resolve('../lib/env')];
  }
}

test('getAnalyticsConfig returns an empty key without throwing when PostHog is not configured', () => {
  withEnv({}, ({ getAnalyticsConfig }) => {
    const config = getAnalyticsConfig();
    assert.equal(config.key, '');
    assert.equal(config.host, 'https://eu.i.posthog.com');
  });
});

test('getAnalyticsConfig reads POSTHOG_KEY and POSTHOG_HOST when set', () => {
  withEnv({ POSTHOG_KEY: 'phc_test123', POSTHOG_HOST: 'https://eu.i.posthog.com' }, ({ getAnalyticsConfig }) => {
    const config = getAnalyticsConfig();
    assert.equal(config.key, 'phc_test123');
    assert.equal(config.host, 'https://eu.i.posthog.com');
  });
});

test('getAnalyticsConfig falls back to NEXT_PUBLIC_ prefixed vars', () => {
  withEnv({ NEXT_PUBLIC_POSTHOG_KEY: 'phc_fallback' }, ({ getAnalyticsConfig }) => {
    const config = getAnalyticsConfig();
    assert.equal(config.key, 'phc_fallback');
  });
});

test('api/config.js includes posthog fields alongside supabase config, without a key present', async () => {
  process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY || 'test-publishable-key';
  delete require.cache[require.resolve('../lib/env')];
  delete require.cache[require.resolve('../api/config')];
  const handler = require('../api/config');

  let statusCode = 0;
  let body = null;
  const res = {
    setHeader() {},
    end(payload) { body = JSON.parse(payload); },
    get statusCode() { return statusCode; },
    set statusCode(v) { statusCode = v; }
  };
  await handler({ method: 'GET' }, res);

  assert.equal(statusCode, 200);
  assert.ok('posthogKey' in body, 'response must include posthogKey');
  assert.ok('posthogHost' in body, 'response must include posthogHost');
  assert.equal(typeof body.posthogHost, 'string');
});
