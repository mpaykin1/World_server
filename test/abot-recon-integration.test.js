'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const ROOT = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

test('ABot-Recon video mode is wired through the existing AI3D stack', () => {
  const server = read('services/ai3d-worker/server.py');
  const runner = read('services/ai3d-worker/ai3d/runner.py');
  const api = read('api/ai3d.js');
  const client = read('apps/ai-3d/client.js');
  const html = read('apps/ai-3d/index.html');

  for (const source of [server, runner, api, client, html]) {
    assert.match(source, /video_to_3d/, 'video_to_3d must be present end-to-end');
  }
  assert.match(runner, /ABotReconEngine/);
  assert.match(server, /verify_video/);
  assert.match(server, /ALLOWED_VIDEO_TYPES/);
});

test('ABot-Recon adapter is fail-closed and bounded for free GPU use', () => {
  const plugin = read('services/ai3d-worker/ai3d/plugins/abot_recon.py');
  assert.match(plugin, /maxFrames/);
  assert.match(plugin, /22_000/);
  assert.match(plugin, /default.*200|params\.get\("maxFrames", 200\)/s);
  assert.match(plugin, /--no-loop-closure/);
  assert.match(plugin, /--save-world-points/);
  assert.match(plugin, /ABOT_RECON_HOME/);
  assert.match(plugin, /ABOT_RECON_PYTHON/);
  assert.doesNotMatch(plugin, /PLACEHOLDER.*success/i);
});

test('ABot-Recon official weight license remains explicit and non-commercial by default', () => {
  const plugin = read('services/ai3d-worker/ai3d/plugins/abot_recon.py');
  const docs = read('docs/ABOT_RECON_INTEGRATION.md');
  assert.match(plugin, /CC BY-NC 4\.0/);
  assert.match(plugin, /commercialWeightsAllowedByDefault.*False/);
  assert.match(docs, /CC BY-NC 4\.0/);
  assert.match(docs, /commercial/i);
});

test('ABot-Recon bootstrap is pinned and isolated from the TRELLIS environment', () => {
  const bootstrap = read('services/ai3d-worker/scripts/bootstrap-linux.sh');
  assert.match(bootstrap, /ABot-Recon/);
  assert.match(bootstrap, /7a10be152d0478265270f46c637f9de963e7a60e/);
  assert.match(bootstrap, /abot-recon/);
  assert.match(bootstrap, /ABOT_RECON_PYTHON/);
});
