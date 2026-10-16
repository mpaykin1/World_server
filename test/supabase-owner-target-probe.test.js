'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { config, probe } = require('../scripts/supabase-owner-target-probe.cjs');
const env = {
  SUPABASE_URL: 'https://xlcdnlsyvxqtopmkweiy.supabase.co',
  SUPABASE_SECRET_KEY: 'sb_secret_mocknotvalid'
};
test('blocks wrong project URL', () => {
  assert.throws(() => config({ ...env, SUPABASE_URL: 'https://iphfwxjuhsucvdyluink.supabase.co' }), /Unexpected/);
});
test('blocks wrong key type', () => {
  assert.throws(() => config({ ...env, SUPABASE_SECRET_KEY: 'invalid' }), /sb_secret/);
});
test('probes with header, never a key in URL', async () => {
  const result = await probe(env, async (url, req) => {
    assert.equal(req.method, 'GET');
    assert.equal(req.headers.apikey, env.SUPABASE_SECRET_KEY);
    assert.ok(!url.includes(env.SUPABASE_SECRET_KEY));
    return { ok: true, status: 200, json: async () => ({ paths: { '/voxel_worlds': {}, '/tasks': {} } }) };
  });
  assert.equal(result.ok, true);
  assert.equal(result.rest_paths, 2);
});
test('rejects unauthorized response', async () => {
  const result = await probe(env, async () => ({ ok: false, status: 401 }));
  assert.equal(result.ok, false);
});
test('rejects invalid JSON response', async () => {
  const result = await probe(env, async () => ({ ok: true, status: 200, json: async () => { throw Error('bad'); } }));
  assert.equal(result.ok, false);
});
