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

test('Cloudflare serves browser Supabase config natively and dynamic APIs keep the Cloud Run fallback', async () => {
  const worker = await loadWorker();
  const originalFetch = global.fetch;
  const seen = [];
  global.fetch = async (request) => {
    seen.push(new URL(request.url));
    return new Response('{"ok":true}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const env = { ASSETS: assetsBinding() };
    const config = await worker.fetch(new Request('https://world.example/api/config'), { ...env, WORLD_SERVER_DEPLOYED_SHA: 'abc123' });
    assert.equal(config.status, 200);
    assert.equal(config.headers.get('x-world-server-config-runtime'), 'cloudflare-native');
    const configBody = await config.json();
    assert.equal(configBody.configured, true);
    assert.equal(configBody.deploymentProvider, 'cloudflare');
    assert.equal(configBody.deploymentService, 'world-server');
    assert.equal(configBody.deployedRevision, 'abc123');
    assert.equal(config.headers.get('x-world-server-deployed-revision'), 'abc123');
    assert.equal(configBody.supabaseUrl, 'https://iphfwxjuhsucvdyluink.supabase.co');
    assert.match(configBody.supabasePublishableKey, /^sb_publishable_/);
    assert.equal(seen.length, 0);

    const game = await worker.fetch(new Request('https://world.example/api/game'), { ...env, WORLD_SERVER_API_ORIGIN: 'https://api.example/' });
    assert.equal(game.status, 200);
    assert.equal(seen[0].origin, 'https://api.example');
  } finally {
    global.fetch = originalFetch;
  }
});

test('World Factory and canon use dedicated Supabase Edge lanes with authenticated writes', async () => {
  const calls=[];
  const worker=await loadWorker();
  const originalFetch=global.fetch;
  global.fetch=async req=>{calls.push(req);return new Response(JSON.stringify({runtime:'edge'}),{status:200,headers:{'content-type':'application/json'}});};
  try {
    const env={ASSETS:assetsBinding()};
    const read=await worker.fetch(new Request('https://world.example/api/world-factory?limit=3'),env);
    assert.equal(read.status,200); assert.equal(read.headers.get('x-world-server-stack-runtime'),'supabase-edge-read');
    assert.match(calls.at(-1).url,/world-stack-read/); assert.match(calls.at(-1).url,/route=world-factory/);
    const denied=await worker.fetch(new Request('https://world.example/api/world-factory',{method:'POST',headers:{'content-type':'application/json'},body:'{}'}),env);
    assert.equal(denied.status,401);
    const write=await worker.fetch(new Request('https://world.example/api/canon',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer test'},body:'{}'}),env);
    assert.equal(write.status,200); assert.equal(write.headers.get('x-world-server-stack-runtime'),'supabase-edge-write'); assert.match(calls.at(-1).url,/world-stack-write/); assert.match(calls.at(-1).url,/route=canon/);
  } finally { global.fetch=originalFetch; }
});

test('world creation UI requires an account and guest play can continue without canon writes',()=>{
  const shell=fs.readFileSync(path.join(root,'shared','golden-ui-shell.js'),'utf8');
  const client=fs.readFileSync(path.join(root,'apps','voxel-world','client.js'),'utf8');
  assert.match(shell,/Войдите в аккаунт, чтобы создавать новые миры/);
  assert.match(client,/async function api[\s\S]*const t=token\(\); if\(t\) headers\.Authorization/);
  assert.match(client,/async function canonApi[\s\S]*const t=token\(\); if\(!t\)return null; headers\.Authorization/);
});


test('Cloudflare asset allowlist publishes the World Graph required by /api/worlds', async () => {
  const ignore = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8');
  assert.match(ignore, /^!data\/$/m);
  assert.match(ignore, /^!data\/world-graph-index\.json$/m);
  const worker = await loadWorker();
  const response = await worker.fetch(new Request('https://world.example/api/worlds'), { ASSETS: assetsBinding() });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.ok(body.worlds.some((world) => world.id === 'voxel-world'));
  assert.ok(body.graph.nodes.includes('voxel-world'));
});

test('Cloudflare emergence read and actions bypass stale Cloud Run with bounded guest request', async () => {
  const worker=await loadWorker();
  const originalFetch=global.fetch,calls=[];
  global.fetch=async request => {
    calls.push(request);
    return new Response(JSON.stringify({worldId:'voxel-world',emergence:{schemaVersion:'1.0.0',revision:4}}),{
      status:200,headers:{'content-type':'application/json'}
    });
  };
  try {
    const body=JSON.stringify({
      action:'macro_read',worldId:'voxel-world',guestId:'22222222-2222-4222-8222-222222222222'
    });
    const env={ASSETS:assetsBinding()};
    const response=await worker.fetch(new Request('https://world.example/api/emergence',{
      method:'POST',headers:{'content-type':'application/json'},body
    }),env);
    assert.equal(response.status,200);
    assert.equal(response.headers.get('x-world-server-emergence-runtime'),'supabase-edge');
    assert.match(calls[0].url,/supabase\.co\/functions\/v1\/world-emergence/);
    assert.doesNotMatch(calls[0].url,/run\.app/);
    assert.equal((await response.json()).emergence.revision,4);
    const denied=await worker.fetch(new Request('https://world.example/api/emergence'),env);
    assert.equal(denied.status,405);
    assert.equal(calls.length,1);
    await assert.rejects(worker.fetch(new Request('https://world.example/api/emergence',{
      method:'POST',body
    }),{...env,WORLD_SERVER_EMERGENCE_ORIGIN:'http://insecure.example'}),/credential-free HTTPS/);
  }finally{global.fetch=originalFetch;}
});

test('Cloudflare rejects oversized emergence requests before upstream fetch',async()=>{
  const worker=await loadWorker(),originalFetch=global.fetch;
  global.fetch=()=>assert.fail('oversized payload must not reach edge');
  try{
    const res=await worker.fetch(new Request('https://world.example/api/emergence',{
      method:'POST',body:'x'.repeat(16385)
    }),{ASSETS:assetsBinding()});
    assert.equal(res.status,413);
  }finally{global.fetch=originalFetch;}
});

test('Cloudflare Voxel init and writes use durable Supabase Edge, not the synthetic Cloud Run bridge',async()=>{
  const worker=await loadWorker(),old=global.fetch,calls=[];
  global.fetch=async req=>{
    calls.push(req);
    return new Response(JSON.stringify({selfId:'guest',world:{id:'main',seed:73194217,settings:{}},
      player:{id:'guest',position:{x:0,y:42,z:0}}}),{
        status:200,headers:{'content-type':'application/json'}
      });
  };
  try{
    const body=JSON.stringify({action:'init',guestId:'22222222-2222-4222-8222-222222222222',worldId:'main'});
    const res=await worker.fetch(new Request('https://world.example/api/voxel',{
      method:'POST',headers:{'content-type':'application/json'},body
    }),{ASSETS:assetsBinding()});
    assert.equal(res.status,200);
    assert.equal(res.headers.get('x-world-server-voxel-runtime'),'supabase-edge');
    assert.equal((await res.json()).world.seed,73194217);
    assert.equal(calls.length,1);
    assert.match(calls[0].url,/supabase\.co\/functions\/v1\/world-emergence/);
  }finally{global.fetch=old;}
});
