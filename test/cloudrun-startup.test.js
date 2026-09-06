'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { once } = require('node:events');

async function freePort() {
  const s = http.createServer();
  await new Promise(r => s.listen(0, '127.0.0.1', r));
  const p = s.address().port;
  await new Promise(r => s.close(r));
  return p;
}

test('real adapter refuses failed entrypoint and recovers when it becomes available', { timeout: 20000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'world-cloudrun-test-'));
  fs.mkdirSync(path.join(root, 'google-ai-studio'));
  fs.mkdirSync(path.join(root, 'lib'));
  for (const name of ['google-ai-studio/cloudrun-entry.cjs', 'lib/world-google-learning.js']) {
    fs.copyFileSync(path.join(__dirname, '..', name), path.join(root, name));
  }
  fs.writeFileSync(path.join(root, 'status'), '404');
  fs.writeFileSync(path.join(root, 'server.js'), `
    const fs=require('fs');
    const s=require('http').createServer((req,res)=>{
      res.writeHead(Number(fs.readFileSync('status','utf8')));
      res.end('fixture');
    }).listen(Number(process.env.PORT),'127.0.0.1');
    process.on('SIGTERM',()=>s.close(()=>process.exit(0)));
  `);
  const port = await freePort();
  let internal = await freePort();
  while (internal === port) internal = await freePort();
  const child = spawn(process.execPath, ['google-ai-studio/cloudrun-entry.cjs'], {
    cwd: root, windowsHide: true, stdio: 'ignore',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot,
      WORLD_SLOT: 'sandbox', PORT: String(port), WORLD_INTERNAL_PORT: String(internal),
      WORLD_SLOT_ENTRYPOINT: '/missing/', WORLD_CHILD_READY_TIMEOUT_MS: '800' }
  });
  t.after(async () => {
    if (child.exitCode === null) {
      if (process.platform === 'win32') {
        const killer = spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
        await once(killer, 'exit');
      } else { child.kill('SIGTERM'); await once(child, 'exit'); }
    }
    fs.rmSync(root, { recursive: true, force: true });
  });
  const probe = async () => {
    const r = await fetch(`http://127.0.0.1:${port}/readyz`);
    return { status: r.status, body: await r.json() };
  };
  let initial;
  for (let i = 0; i < 80; i++) {
    try { initial = await probe(); if (initial.body.childStatus === 404) break; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(initial?.body.childStatus, 404);
  assert.equal(initial.status, 503, 'a missing entrypoint must block startup');
  for (const status of [401, 403, 500, 200]) {
    fs.writeFileSync(path.join(root, 'status'), String(status));
    const result = await probe();
    assert.equal(result.status, status === 200 ? 200 : 503, `upstream ${status}`);
    assert.equal(result.body.ok, status === 200);
  }
  const rootResponse = await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' });
  assert.equal(rootResponse.status, 302);
  assert.equal(rootResponse.headers.get('location'), '/missing/');
  assert.equal(new URL('./client.js', new URL(rootResponse.headers.get('location'), `http://127.0.0.1:${port}`)).pathname, '/missing/client.js');
});

test('container runtime matches package engine and startup probes require readiness', () => {
  const root = path.join(__dirname, '..');
  const docker = fs.readFileSync(path.join(root, 'google-ai-studio/Dockerfile'), 'utf8');
  const major = require('../package.json').engines.node.split('.')[0];
  assert.match(docker, new RegExp(`FROM node:${major}-alpine`));
  assert.ok(docker.indexOf('npm ci --omit=dev') < docker.indexOf('COPY . .'));
  for (const slot of ['navigator', 'sandbox']) {
    const yaml = fs.readFileSync(path.join(root, `google-ai-studio/cloudrun-service-${slot}.yaml`), 'utf8');
    assert.match(yaml, /startupProbe:[\s\S]*?path: \/readyz/);
  }
  const exclusions = fs.readFileSync(path.join(root, '.dockerignore'), 'utf8').split(/\r?\n/);
  for (const entry of ['**/node_modules', '**/.env', '**/.env.*', '**/.git', '**/.npmrc']) assert.ok(exclusions.includes(entry), entry);
});

test('actual server preserves all consolidated public URLs and local assets', { timeout: 15000 }, async t => {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'), windowsHide: true, stdio: 'ignore',
    env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot, PORT: String(port) }
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await once(child, 'exit'); } });
  const base = `http://127.0.0.1:${port}`;
  let response;
  for (let i = 0; i < 80; i++) {
    try { response = await fetch(base + '/api/locales'); break; } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  assert.equal(response?.status, 200);
  assert.equal((await response.json()).ok, true);
  const routes = require('../vercel.json').rewrites.filter(r => r.destination.startsWith('/api/features?'));
  assert.equal(routes.length, 16);
  for (const route of routes) {
    const res = await fetch(base + route.source, { method: 'OPTIONS' });
    assert.equal(res.status, 405, route.source);
    assert.ok(res.headers.get('allow'), route.source);
  }
  for (const asset of ['/apps/dark-void-scene/', '/apps/dark-void-scene/client.js', '/shared/dark-void-scene-runtime.mjs']) {
    const res = await fetch(base + asset);
    assert.equal(res.status, 200, asset);
    assert.ok((await res.text()).length > 100, asset);
  }
  for (const privatePath of ['/.env', '/.git/config', '/lib/env.js']) {
    const res = await fetch(base + privatePath);
    assert.equal(res.status, 404, privatePath);
  }
});
