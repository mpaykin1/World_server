'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

// Architecture regression guard: login/me/logout only need a valid Supabase
// URL + publishable key. Confirmed directly against a real Supabase project
// (curl against /auth/v1/user and /auth/v1/logout): failures there are
// bad_jwt/no_authorization, never a privilege error, and public.profiles is
// RLS-readable by anon. So none of these three should ever construct an
// admin/service-role client — doing so would make them needlessly depend on
// SUPABASE_SECRET_KEY (or its Preview-isolated equivalent), which is exactly
// the dependency this was fixed to remove. Only register.js (which calls
// admin.auth.admin.createUser to skip email confirmation for synthetic
// accounts) and the game/voxel/quality-write endpoints (RLS denies
// anon/authenticated by design) legitimately still need it.

const ENV_KEYS = ['SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'VERCEL_ENV'];

function withPublicEnvOnly(fn) {
  const saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'test-publishable-key';
  // Deliberately no secret key set — these handlers must not need one.
  try {
    return fn();
  } finally {
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// login/me/logout moved from api/*.js to lib/api-handlers/*.js behind the
// api/auth.js router (Vercel Hobby function-count consolidation) — this
// test targets their real module location, not the router that dispatches
// to them.
for (const file of ['login', 'me', 'logout']) {
  test(`lib/api-handlers/${file}.js does not require an admin/service-role key to load or run its module body`, () => {
    withPublicEnvOnly(() => {
      delete require.cache[require.resolve(`../lib/api-handlers/${file}.js`)];
      // Loading must not throw even though no SUPABASE_SECRET_KEY is set —
      // if the module called createAdminClient() (or getSecretKey()) at
      // call time with a real request, that would throw "Supabase server
      // secret environment variable is not configured."
      assert.doesNotThrow(() => require(`../lib/api-handlers/${file}.js`));
    });
  });

  test(`lib/api-handlers/${file}.js source does not reference createAdminClient`, () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '..', 'lib', 'api-handlers', `${file}.js`), 'utf8');
    assert.ok(!source.includes('createAdminClient'), `lib/api-handlers/${file}.js must not use the admin/service-role Supabase client`);
  });
}
