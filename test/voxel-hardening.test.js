'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'apps/voxel-world/client.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'apps/voxel-world/index.html'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/voxel.js'), 'utf8');

test('voxel client prefers local Three.js and has a worker mesher', () => {
  const local = client.indexOf("import('./vendor/three.module.min.js')");
  const fallback = client.indexOf("https://unpkg.com/three@0.165.0/build/three.module.js");
  assert.ok(local >= 0, 'local Three.js import missing');
  assert.ok(fallback > local, 'CDN may only be a fallback after local import');
  assert.match(client, /new Worker\('\.\/chunk-worker\.js'\)/);
  assert.match(client, /scheduleChunkResync/);
});

test('failed or corrupt worker jobs are recovered instead of dropped', () => {
  assert.match(client, /function recoverMeshJob\(job\)/);
  assert.match(client, /recoverMeshJob\(failedJob\)/);
  assert.match(client, /result\.jobId!==job\.id/);
  assert.match(client, /result\.key!==job\.key/);
  assert.match(client, /result\.version!==job\.version/);
});

test('persistent selected block shares strict block validation', () => {
  assert.match(api, /const selectedBlock = safeBlockType\(body\.selectedBlock \?\? 1\)/);
  assert.doesNotMatch(api, /min\(255/);
});

test('block broadcast happens after authoritative API write', () => {
  const editStart = client.indexOf('async function editBlock');
  const apiWrite = client.indexOf("await api('set_block'", editStart);
  const broadcast = client.indexOf("event:'block_set'", editStart);
  assert.ok(editStart >= 0 && apiWrite > editStart && broadcast > apiWrite);
});

test('all static HUD ids used by the upgraded client exist in HTML', () => {
  for (const id of ['loading','vwStatus','vwBiome','vwPlayers','vwPerf','targetInfo','hotbar']) {
    assert.match(html, new RegExp(`id=["']${id}["']`));
  }
});

test('browser client never contains a Supabase server secret', () => {
  assert.doesNotMatch(client, /service_role|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/i);
});
