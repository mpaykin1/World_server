'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

async function worker() {
  const source = fs.readFileSync(path.join(__dirname, '..', 'cloudflare-worker.js'), 'utf8');
  return (await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'))).default;
}

const target = 'https://xlcdnlsyvxqtopmkweiy.supabase.co';
const source = 'https://iphfwxjuhsucvdyluink.supabase.co';
const req = (route, method = 'GET') => new Request('https://world.example' + route,
  method === 'GET' ? {} : { method, body: '{}', headers: { authorization: 'Bearer test' } });

test('new Supabase project fails closed before all Edge bindings are configured', async () => {
  const app = await worker();
  const orig = global.fetch;
  let upstream = 0;
  global.fetch = async () => { upstream++; throw Error('unexpected network call'); };
  try {
    const env = { SUPABASE_URL: target };
    const config = await app.fetch(req('/api/config'), env);
    const publicConfig = await config.json();
    assert.equal(publicConfig.configured, false);
    assert.equal(publicConfig.supabaseUrl, '');
    assert.equal(publicConfig.supabasePublishableKey, '');
    for (const [route, method, binding] of [
      ['/api/world-factory', 'GET', 'WORLD_SERVER_STACK_READ_ORIGIN'],
      ['/api/canon', 'POST', 'WORLD_SERVER_STACK_WRITE_ORIGIN'],
      ['/api/emergence', 'POST', 'WORLD_SERVER_EMERGENCE_ORIGIN'],
      ['/api/quality-summary', 'GET', 'WORLD_SERVER_QUALITY_SUMMARY_ORIGIN'],
      ['/api/quality-telemetry', 'POST', 'WORLD_SERVER_QUALITY_TELEMETRY_ORIGIN'],
      ['/api/game', 'GET', 'WORLD_SERVER_API_ORIGIN']
    ]) {
      await assert.rejects(app.fetch(req(route, method), env), new RegExp(binding + ' is required'));
    }
    assert.equal(upstream, 0, 'migration must not accidentally call old production');
  } finally { global.fetch = orig; }
});

test('partial cutover refuses old and third-party endpoints, even with valid HTTPS', async () => {
  const app = await worker();
  const orig = global.fetch;
  global.fetch = async () => assert.fail('unexpected upstream');
  try {
    const env = { SUPABASE_URL: target, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_targettest' };
    for (const origin of [
      source + '/functions/v1/world-stack-write',
      'https://other.supabase.co/functions/v1/world-stack-write',
      target + '/functions/v1/world-stack-read',
      target + '/functions/v1/world-stack-write?route=wrong',
      target + '/functions/v1/world-stack-write#wrong'
    ]) {
      await assert.rejects(app.fetch(req('/api/canon', 'POST'), {
        ...env, WORLD_SERVER_STACK_WRITE_ORIGIN: origin
      }), /must point to the selected Supabase project function/);
    }
  } finally { global.fetch = orig; }
});

test('fully explicit target origins forward only to target, leaving default old production unchanged', async () => {
  const app = await worker();
  const orig = global.fetch;
  const urls = [];
  global.fetch = async request => {
    urls.push(new URL(request.url));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = {
      SUPABASE_URL: target, SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_targettest',
      WORLD_SERVER_API_ORIGIN: 'https://api-new.example',
      WORLD_SERVER_STACK_READ_ORIGIN: target + '/functions/v1/world-stack-read',
      WORLD_SERVER_STACK_WRITE_ORIGIN: target + '/functions/v1/world-stack-write',
      WORLD_SERVER_EMERGENCE_ORIGIN: target + '/functions/v1/world-emergence',
      WORLD_SERVER_QUALITY_SUMMARY_ORIGIN: target + '/functions/v1/quality-summary',
      WORLD_SERVER_QUALITY_TELEMETRY_ORIGIN: target + '/functions/v1/quality-telemetry'
    };
    assert.equal((await (await app.fetch(req('/api/config'), env)).json()).configured, true);
    for (const [route, method] of [
      ['/api/world-factory?limit=2', 'GET'],
      ['/api/canon', 'POST'],
      ['/api/emergence', 'POST'],
      ['/api/quality-summary', 'GET'],
      ['/api/quality-telemetry', 'POST']
    ]) {
      assert.equal((await app.fetch(req(route, method), env)).status, 200);
    }
    assert.equal(urls.length, 5);
    for (const url of urls) assert.equal(url.origin, target);
    assert.equal((await app.fetch(req('/api/game'), env)).status, 200);
    assert.equal(urls.at(-1).origin, 'https://api-new.example');
    assert.equal((await app.fetch(req('/api/world-factory'), {})).status, 200);
    assert.equal(urls.at(-1).origin, source, 'unchanged source is still default until explicit cutover');
  } finally { global.fetch = orig; }
});
