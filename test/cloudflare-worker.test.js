'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const workerSource = fs.readFileSync(path.join(root, 'cloudflare-worker.js'), 'utf8').replace(/^\uFEFF/, '');

async function loadWorker() {
  const url = `data:text/javascript;base64,${Buffer.from(workerSource).toString('base64')}#${Date.now()}-${Math.random()}`;
  return (await import(url)).default;
}

function assetsBinding() {
  return {
    async fetch(request) {
      const pathname = new URL(request.url).pathname;
      const relative = decodeURIComponent(pathname).replace(/^\/+/, '');
      const file = path.resolve(root, relative);
      if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        return new Response('not found', { status: 404 });
      }
      const body = fs.readFileSync(file);
      const contentType = relative.endsWith('.json') ? 'application/json' : relative.endsWith('.xml') ? 'application/rss+xml' : 'application/octet-stream';
      return new Response(body, { status: 200, headers: { 'content-type': contentType } });
    }
  };
}

test('Cloudflare no longer hard-depends on exhausted Netlify API quota', () => {
  assert.equal(workerSource.includes('world-server.netlify.app'), false);
  assert.match(workerSource, /world-server-ai-studio-bridge-514578099152\.europe-west2\.run\.app/);
  assert.match(workerSource, /WORLD_SERVER_API_ORIGIN/);
});

test('Cloudflare serves apps and Universal Lore Graph natively from canonical static artifacts', async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request('https://world.example/api/apps?all=1'), { ASSETS: assetsBinding() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.edgeRuntime, 'cloudflare-native-read');
  assert.ok(body.apps.some((app) => app.id === 'voxel-world'));
  assert.ok(Array.isArray(body.inventory));
  assert.equal(body.loreGraph.type, 'UniversalLoreGraph');
  assert.equal(body.loreGraph.connected, true);
  assert.ok(body.loreGraph.nodeCount >= 8);
});

test('Cloudflare serves IndieWorld passports without an upstream request', async () => {
  const worker = await loadWorker();
  const response = await worker.fetch(new Request('https://world.example/api/worlds?format=indieweb&id=voxel-world'), { ASSETS: assetsBinding() });
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/vnd\.world-server\.indieworld\+json/);
  const body = await response.json();
  assert.equal(body.id, 'voxel-world');
});

test('dynamic Cloudflare APIs use Cloud Run by default and allow a safe HTTPS override', async () => {
  const worker = await loadWorker();
  const originalFetch = global.fetch;
  const seen = [];
  global.fetch = async (request) => {
    seen.push(new URL(request.url));
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = { ASSETS: assetsBinding() };
    const first = await worker.fetch(new Request('https://world.example/api/config'), env);
    assert.equal(first.status, 200);
    assert.equal(seen[0].origin, 'https://world-server-ai-studio-bridge-514578099152.europe-west2.run.app');
    assert.equal(first.headers.get('x-world-server-api-upstream'), 'world-server-ai-studio-bridge-514578099152.europe-west2.run.app');

    const second = await worker.fetch(new Request('https://world.example/api/game'), { ...env, WORLD_SERVER_API_ORIGIN: 'https://api.example/' });
    assert.equal(second.status, 200);
    assert.equal(seen[1].origin, 'https://api.example');
  } finally {
    global.fetch = originalFetch;
  }
});