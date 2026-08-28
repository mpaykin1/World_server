'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Regression protection for the root cause behind /api/config 500ing on every
// Preview deployment except one specific git branch: SUPABASE_URL and
// SUPABASE_PUBLISHABLE_KEY are public/client-safe and belong on all Preview
// branches, but SUPABASE_SECRET_KEY (the production service-role key) must
// never follow them there. These tests pin two separate invariants:
//   1. /api/config must keep working with zero admin/secret env vars set.
//   2. In Preview, admin Supabase access must only ever come from a distinct
//      least-privilege SUPABASE_PREVIEW_SECRET_KEY, never a fallback to the
//      production secret — even if the production secret happens to be set.

const ENV_KEYS = [
  'SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY', 'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_PREVIEW_URL', 'SUPABASE_PREVIEW_SECRET_KEY',
  'VERCEL_ENV'
];

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

test('getPublicConfig succeeds with zero secret/admin env vars set (root cause of the preview 500)', () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-key' }, ({ getPublicConfig }) => {
    const config = getPublicConfig();
    assert.equal(config.url, 'https://example.supabase.co');
    assert.equal(config.publishableKey, 'test-key');
  });
});

test('api/config.js responds 200 with zero secret/admin env vars set', async () => {
  withEnv({ SUPABASE_URL: 'https://example.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'test-key' }, () => {
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
    return handler({ method: 'GET' }, res).then(() => {
      assert.equal(statusCode, 200);
      assert.ok(body);
    });
  });
});

test('SECURITY: api/config.js response never includes anything but the public allowlist', async () => {
  withEnv({
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'test-key',
    SUPABASE_SECRET_KEY: 'this-must-never-appear-in-the-response-sk_live_test',
    POSTHOG_KEY: 'phc_test'
  }, () => {
    delete require.cache[require.resolve('../api/config')];
    const handler = require('../api/config');
    let body = null;
    const res = { setHeader() {}, end(payload) { body = JSON.parse(payload); }, statusCode: 200 };
    return handler({ method: 'GET' }, res).then(() => {
      const ALLOWED_KEYS = ['supabaseUrl', 'supabasePublishableKey', 'posthogKey', 'posthogHost'];
      for (const key of Object.keys(body)) {
        assert.ok(ALLOWED_KEYS.includes(key), `unexpected key "${key}" in public /api/config response`);
      }
      const serialized = JSON.stringify(body);
      assert.ok(!serialized.includes('this-must-never-appear'), 'SUPABASE_SECRET_KEY leaked into the public config response');
    });
  });
});

test('getSecretKey in Preview refuses the production secret and requires SUPABASE_PREVIEW_SECRET_KEY', () => {
  withEnv({
    VERCEL_ENV: 'preview',
    SUPABASE_SECRET_KEY: 'production-secret-must-not-be-usable-in-preview'
  }, ({ getSecretKey }) => {
    assert.throws(() => getSecretKey(), /SUPABASE_PREVIEW_SECRET_KEY/);
  });
});

test('getSecretKey in Preview succeeds once SUPABASE_PREVIEW_SECRET_KEY is set, and returns exactly that value', () => {
  withEnv({
    VERCEL_ENV: 'preview',
    SUPABASE_SECRET_KEY: 'production-secret-should-be-ignored-here',
    SUPABASE_PREVIEW_SECRET_KEY: 'preview-only-least-privilege-key'
  }, ({ getSecretKey }) => {
    assert.equal(getSecretKey(), 'preview-only-least-privilege-key');
  });
});

test('getSecretKey outside Preview (production/local) is unaffected and still uses SUPABASE_SECRET_KEY', () => {
  withEnv({ SUPABASE_SECRET_KEY: 'prod-secret' }, ({ getSecretKey }) => {
    assert.equal(getSecretKey(), 'prod-secret');
  });
});

test('createAdminClient in Preview points at SUPABASE_PREVIEW_URL, not the public production URL', () => {
  withEnv({
    VERCEL_ENV: 'preview',
    SUPABASE_URL: 'https://production-project.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'pub-key',
    SUPABASE_PREVIEW_URL: 'https://preview-project.supabase.co',
    SUPABASE_PREVIEW_SECRET_KEY: 'preview-secret'
  }, ({ createAdminClient }) => {
    const client = createAdminClient();
    assert.equal(client.supabaseUrl, 'https://preview-project.supabase.co');
  });
});
