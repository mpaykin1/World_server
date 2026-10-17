'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { config, probe } = require('../scripts/supabase-owner-target-probe.cjs');
const origin = 'https://xlcdnlsyvxqtopmkweiy.supabase.co';
const oldOrigin = 'https://iphfwxjuhsucvdyluink.supabase.co';
const env = { SUPABASE_URL: origin, SUPABASE_SECRET_KEY: 'sb_secret_mocknotvalid' };
const explicit = { WS_TARGET_SUPABASE_URL: origin, WS_TARGET_SUPABASE_SECRET_KEY: 'sb_secret_targetfixture' };
const document = () => ({ swagger: '2.0', info: { title: 'PostgREST API', version: 'fixture-only' },
  host: 'xlcdnlsyvxqtopmkweiy.supabase.co', paths: {
    '/voxel_worlds': { get: { responses: { 200: { description: 'World rows' } } } },
    '/tasks': { get: { responses: { 200: { description: 'Task rows' } } } },
  } });
const respond = payload => async () => ({ ok: true, status: 200, json: async () => payload });

test('blocks URLs that could contact another project or transmit secrets outside the exact target origin', () => {
  for (const url of [oldOrigin, origin + '.evil.test', 'http://' + origin.slice(8),
    origin + ':8443', origin + '/rest/v1', origin + '//', origin + '/other/..',
    origin + '?apikey=' + env.SUPABASE_SECRET_KEY, origin + '#fragment',
    'https://user:password@' + origin.slice(8), 'https://user@' + origin.slice(8),
    origin + '/%2e', 'https://']) {
    assert.throws(() => config({ ...env, SUPABASE_URL: url }), /Unexpected/);
  }
  assert.equal(config({ ...env, SUPABASE_URL: origin + ':443/' }).url, origin);
});

test('requires modern backend secret format and keeps keys out of validation exceptions', () => {
  for (const key of ['invalid', 'sb_publishable_fixture', 'sb_secret_', 'sb_secret_bad\ninjected', 'eyJlegacy']) {
    assert.throws(() => config({ ...env, SUPABASE_SECRET_KEY: key }), /sb_secret/);
  }
  assert.throws(() => config({ ...env, SUPABASE_URL: env.SUPABASE_SECRET_KEY }), error =>
    !error.message.includes(env.SUPABASE_SECRET_KEY));
});

test('uses an explicit target pair while preserving the independently configured production pair', () => {
  const result = config({ ...env, SUPABASE_URL: oldOrigin, ...explicit });
  assert.deepEqual(result, { url: origin, key: explicit.WS_TARGET_SUPABASE_SECRET_KEY });
  assert.deepEqual(config(env), { url: origin, key: env.SUPABASE_SECRET_KEY });
});

test('never combines a target URL with a global/source key or falls back from an empty explicit pair', () => {
  for (const added of [
    { WS_TARGET_SUPABASE_URL: origin }, { WS_TARGET_SUPABASE_SECRET_KEY: explicit.WS_TARGET_SUPABASE_SECRET_KEY },
    { WS_TARGET_SUPABASE_URL: '', WS_TARGET_SUPABASE_SECRET_KEY: '' },
  ]) assert.throws(() => config({ ...env, ...added }), /configuration/);
});

test('requests only target OpenAPI with GET, header secret, disabled redirects and bounded abort signal', async () => {
  const result = await probe(explicit, async (url, req) => {
    assert.equal(url, origin + '/rest/v1/');
    assert.equal(req.method, 'GET');
    assert.equal(req.redirect, 'error');
    assert.equal(req.headers.apikey, explicit.WS_TARGET_SUPABASE_SECRET_KEY);
    assert.equal(req.headers.Accept, 'application/openapi+json');
    assert.ok(req.signal instanceof AbortSignal);
    assert.equal(req.signal.aborted, false);
    assert.ok(!url.includes(explicit.WS_TARGET_SUPABASE_SECRET_KEY));
    assert.equal(Object.hasOwn(req, 'body'), false);
    return { ok: true, status: 200, json: async () => document() };
  });
  assert.equal(result.ok, true);
  assert.equal(result.rest_paths, 2);
  assert.equal(result.openapi_version, '2.0');
  assert.equal(result.project_ref, 'xlcdnlsyvxqtopmkweiy');
  assert.equal(result.verification_scope, 'TARGET_REST_SCHEMA_READ_ONLY');
  assert.ok(!JSON.stringify(result).includes(explicit.WS_TARGET_SUPABASE_SECRET_KEY));
});

test('accepts a meaningful OpenAPI 3 document without fabricating absent identity metadata', async () => {
  const payload = document(); delete payload.swagger; delete payload.host;
  payload.openapi = '3.1.0'; payload.servers = [{ url: origin + '/rest/v1' }];
  const result = await probe(env, respond(payload));
  assert.equal(result.ok, true);
  assert.equal(result.openapi_version, '3.1.0');
});

test('rejects wrong-project metadata even when the requested URL was correct', async () => {
  for (const mutation of [p => { p.host = oldOrigin.slice(8); },
    p => { p.servers = [{ url: oldOrigin + '/rest/v1' }]; },
    p => { p.servers = [{ url: '//evil.test/rest/v1' }]; }]) {
    const payload = document(); mutation(payload);
    const result = await probe(env, respond(payload));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'unexpected_openapi_origin');
  }
});

test('rejects authorization errors and all non-200/invalid status responses without exposing response bodies', async () => {
  for (const status of [401, 403, 302, 500, 204]) {
    const result = await probe(env, async () => ({ ok: status < 400, status,
      json: async () => { throw Error('must not read failure body ' + env.SUPABASE_SECRET_KEY); } }));
    assert.equal(result.ok, false);
    assert.equal(result.status, status);
    assert.equal(result.reason, 'http_error');
    assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
  }
});

test('rejects malformed JSON without printing error details or an injected key', async () => {
  const result = await probe(env, async () => ({ ok: true, status: 200,
    json: async () => { throw Error('bad JSON contains ' + env.SUPABASE_SECRET_KEY); } }));
  assert.deepEqual(result, { ok: false, reason: 'invalid_json' });
});

test('HTTP 200 empty/fake/incomplete OpenAPI documents never establish readiness', async () => {
  for (const payload of [{}, null, [], 'OK', { paths: { '/worlds': {} } },
    { ...document(), swagger: '7.0' }, { ...document(), paths: {} },
    { ...document(), info: {} }, { ...document(), paths: { '/worlds': {} } },
    { ...document(), paths: { '/worlds': { get: {} } } },
    { ...document(), paths: { 'worlds': { get: { responses: { 200: {} } } } } },
  ]) {
    const result = await probe(env, respond(payload));
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'invalid_openapi');
  }
});

test('redacts thrown request errors, including errors containing configured secret and URL', async () => {
  const result = await probe(env, async () => { throw Error(origin + '?apikey=' + env.SUPABASE_SECRET_KEY); });
  assert.deepEqual(result, { ok: false, reason: 'request_failed' });
  assert.ok(!JSON.stringify(result).includes(env.SUPABASE_SECRET_KEY));
});

test('uses a ten-second deadline and returns a redacted timeout result', async t => {
  const aborted = AbortSignal.abort();
  t.mock.method(AbortSignal, 'timeout', milliseconds => {
    assert.equal(milliseconds, 10000);
    return aborted;
  });
  const result = await probe(env, async (_url, request) => {
    assert.equal(request.signal, aborted);
    throw Error('timeout details ' + env.SUPABASE_SECRET_KEY);
  });
  assert.deepEqual(result, { ok: false, reason: 'request_timeout' });
});
