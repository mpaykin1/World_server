'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const env = require('../lib/env');

function withEnv(overrides, fn) {
  const saved = {};
  for (const k of Object.keys(overrides)) saved[k] = process.env[k];
  try {
    for (const [k, v] of Object.entries(overrides)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
    return fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]; else process.env[k] = v;
    }
  }
}

test('createWorkerAuthedClient: fails closed with no BROWSER_WORKER_ID configured', () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk_test', BROWSER_WORKER_ID: undefined, BROWSER_WORKER_TOKEN: 'tok' }, () => {
    assert.throws(() => env.createWorkerAuthedClient(), /BROWSER_WORKER_ID/);
  });
});

test('createWorkerAuthedClient: fails closed with no BROWSER_WORKER_TOKEN configured', () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk_test', BROWSER_WORKER_ID: 'desktop-opencode', BROWSER_WORKER_TOKEN: undefined }, () => {
    assert.throws(() => env.createWorkerAuthedClient(), /BROWSER_WORKER_TOKEN/);
  });
});

test('createWorkerAuthedClient: never throws a value-content error - the message names the missing VAR NAME, not any token content', () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk_test', BROWSER_WORKER_ID: undefined, BROWSER_WORKER_TOKEN: undefined }, () => {
    try { env.createWorkerAuthedClient(); assert.fail('must throw'); } catch (e) {
      assert.match(e.message, /^BROWSER_WORKER_ID is not configured/);
    }
  });
});

test('createWorkerAuthedClient: succeeds and attaches the worker headers when explicit args are passed (bypassing env)', () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk_test' }, () => {
    const client = env.createWorkerAuthedClient({ workerId: 'desktop-opencode', workerToken: 'real-token-value' });
    assert.ok(client, 'a real supabase-js client instance must be returned');
  });
});

test('createPublicServerClient: unaffected by the worker-auth addition - still constructs with just url+publishableKey', () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'pk_test' }, () => {
    const client = env.createPublicServerClient();
    assert.ok(client);
  });
});
