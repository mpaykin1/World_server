'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { buildEmergenceState } = require('../lib/world-emergence');
const voxel = require('../api/voxel')._private;
const syncUrl = pathToFileURL(path.resolve(__dirname, '../shared/emergence-authority-sync.mjs')).href;
const sync = async () => (await import(syncUrl)).createEmergenceAuthoritySync;
const state = revision => ({ schemaVersion:'1.0.0', revision, entities:[], relations:[], features:[] });

test('untrusted realtime payload only requests server snapshot, never injects entities', async () => {
  const make = await sync();
  let serverReads = 0, applied = null;
  const driver = make({
    read: async () => { serverReads++; return { emergence:state(4) }; },
    apply: snapshot => { applied = snapshot; },
    revision: () => 3
  });
  assert.equal(driver.signal({ ...state(99999), entities:[{ id:'fake-dragon' }] }), true);
  await driver.refresh();
  assert.equal(serverReads, 1);
  assert.deepEqual(applied, state(4));
});

test('invalid and stale notifications do not trigger server reads', async () => {
  const make = await sync();
  let reads = 0;
  const driver = make({
    read: async () => { reads++; return { emergence:state(6) }; },
    apply: () => {},
    revision: () => 5
  });
  for (const payload of [state(5), state(4), {revision:6},
    {...state(6),revision:Infinity}, {...state(6),revision:5.5}]) {
    assert.equal(driver.signal(payload), false);
  }
  assert.equal(reads, 0);
});

test('invalid authoritative snapshots fail closed, preserving existing client state', async () => {
  const make = await sync();
  const warnings = [], applied = [];
  const driver = make({
    read: async () => ({ emergence: { ...state(8), schemaVersion:'forged' } }),
    apply: value => applied.push(value),
    revision: () => 3, warn: message => warnings.push(message)
  });
  await driver.refresh();
  assert.equal(applied.length, 0);
  assert.match(warnings.join(' '), /snapshot is invalid/);
});

test('a snapshot that arrives after a newer local mutation cannot roll it back', async () => {
  const make = await sync();
  let resolveRead, localRevision = 2;
  const driver = make({
    read: () => new Promise(resolve => {resolveRead = resolve;}),
    apply: () => assert.fail('older snapshot must never replace local state'),
    revision: () => localRevision
  });
  const pending = driver.refresh();
  await new Promise(resolve => setImmediate(resolve));
  localRevision = 4;
  resolveRead({emergence:state(3)});
  await pending;
});

test('broadcast storms coalesce into a bounded number of authoritative reads', async () => {
  const make = await sync();
  let now = 1000, pending = [], calls = 0, localRevision = 1;
  const driver = make({
    read: () => {calls++;return new Promise(resolve => pending.push(resolve));},
    apply: snap => {localRevision = snap.revision;},
    revision: () => localRevision, clock:()=>now, minimumIntervalMs:500,
    defer: (callback, delay) => {now += delay;queueMicrotask(callback);},
  });
  driver.signal(state(2));
  await new Promise(resolve=>setImmediate(resolve));
  for(let i=0;i<40;i++)driver.signal(state(3));
  assert.equal(calls,1);
  pending.shift()({emergence:state(2)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);
  pending.shift()({emergence:state(3)});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(calls,2);
});

test('macro_read exposes persisted server state without mutating the world', async () => {
  const authoritative = buildEmergenceState({
    seed:7, entities:[{type:'city',x:0,z:0},{type:'forest',x:32,z:0}],revision:9
  });
  const world = {id:'main',seed:7,settings:{worldDNA:{emergence:authoritative}}};
  let writes = 0;
  const admin = {from: name => {
    assert.equal(name,'voxel_worlds');
    return {
      select(){return this;},
      eq(k,v){assert.equal(k,'id');assert.equal(v,'main');return this;},
      async single(){return {data:world,error:null};},
      update(){writes++;throw Error('unexpected write');}
    };
  }};
  const result = await voxel.actionMacroRead(admin,{worldId:'main'});
  assert.equal(result.worldId,'main');
  assert.equal(result.emergence.revision,9);
  assert.equal(result.emergence.relations[0].kind,'living_frontier');
  assert.equal(writes,0);
});

test('Voxel client receives broadcasts as revision hints and uses the new read endpoint', () => {
  const client = fs.readFileSync(path.resolve(__dirname,'../apps/voxel-world/client.js'),'utf8');
  const server = fs.readFileSync(path.resolve(__dirname,'../api/voxel.js'),'utf8');
  assert.match(client,/event:'macro_state'.*emergenceSync\.signal\(payload\)/);
  assert.doesNotMatch(client,/event:'macro_state'.*applyEmergenceState\(payload\)/);
  assert.match(client,/emergenceApi\('macro_read'/);
  assert.match(client,/emergenceApi\('macro_place'/);
  assert.match(client,/emergenceApi\('macro_tick'/);
  assert.match(server,/action === 'macro_read'/);
});

test('dedicated edge handler preserves macro IDs, revision CAS and read-only snapshots', () => {
  const root=path.resolve(__dirname,'..');
  const edge=fs.readFileSync(path.join(root,'supabase/functions/world-emergence/index.ts'),'utf8');
  assert.match(edge,/if\(action==="macro_read"\)return await read\(admin,b\)/);
  assert.match(edge,/if\(hasExpected&&current\.revision!==expected\)return null/);
  assert.match(edge,/\.eq\("updated_at",row\.updated_at\)/);
  assert.match(edge,/if\(!next\)return\{row,emergence:current,skipped:true\}/);
  assert.match(edge,/normalizeEntity\(\{id,type,x,z,ownerId:who\.id\}/);
  const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
  assert.ok(vercel.rewrites.some(r=>r.source==='/api/emergence'&&r.destination==='/api/voxel'));
  const server=fs.readFileSync(path.join(root,'server.js'),'utf8');
  assert.match(server,/\['\/api\/emergence', require\('\.\/api\/voxel'\)\]/);
});

test('Cloudflare runtime smoke reads the canonical shared world from Supabase Edge',()=>{
  const root=path.resolve(__dirname,'..');
  const client=fs.readFileSync(path.join(root,'apps/voxel-world/client.js'),'utf8');
  const smoke=fs.readFileSync(path.join(root,'scripts/verify-cloudflare-stack.cjs'),'utf8');
  assert.match(client,/requestedWorldId = new URLSearchParams\(location.search\).get\('world'\) \|\| 'main'/);
  assert.match(smoke,/action: 'macro_read', guestId, worldId: 'main'/);
  assert.match(smoke,/x-world-server-emergence-runtime/);
});
