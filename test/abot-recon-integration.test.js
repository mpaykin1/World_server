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
  assert.match(runner, /self\.abot_recon\s*=\s*ABotReconEngine\(\)/);
  assert.match(server, /verify_video/);
  assert.match(server, /ALLOWED_VIDEO_TYPES/);
  assert.match(server, /needs_video\s*=\s*mode\s*==\s*"video_to_3d"/);
  assert.match(server, /file\.content_type\s+not\s+in\s+ALLOWED_VIDEO_TYPES/);
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

test('Python bridge files do not contain escaped newline corruption', () => {
  for (const p of [
    'services/ai3d-worker/server.py',
    'services/ai3d-worker/ai3d/runner.py',
    'services/ai3d-worker/ai3d/validation.py',
  ]) {
    assert.doesNotMatch(read(p), /\\\\n(?=from |MAX_|\s{4,}["']|\s{4,}self\.)/);
  }
});

test('free ZeroGPU path is deployable, secret-protected, and preferred when configured', () => {
  const plugin = read('services/ai3d-worker/ai3d/plugins/abot_recon.py');
  const remote = read('services/ai3d-worker/ai3d/plugins/abot_zerogpu.py');
  const space = read('deploy/huggingface/abot-recon-zero-gpu/app.py');
  const deploy = read('scripts/deploy-abot-zerogpu.py');

  assert.match(plugin, /ABotZeroGpuClient/);
  assert.match(plugin, /self\.zerogpu\.configured\(\)/);
  assert.match(remote, /ABOT_RECON_ZEROGPU_URL/);
  assert.match(remote, /ABOT_RECON_ZEROGPU_SECRET/);
  assert.match(remote, /reconstruct_api/);
  assert.match(space, /@spaces\.GPU\(duration=120\)/);
  assert.match(space, /hmac\.compare_digest/);
  assert.match(space, /api_visibility="public"/);
  assert.match(space, /ABOT_WORKER_SECRET/);
  assert.match(deploy, /space_hardware="zero-a10g"/);
  assert.match(deploy, /add_space_secret/);
  assert.doesNotMatch(space, /hf_[A-Za-z0-9]{20,}/);
});
