'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const handler = require('../api/roblox');

function response() {
  return {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(name, value) { this.headers[String(name).toLowerCase()] = String(value); },
    end(body = '') { this.body += body; },
    json() { return JSON.parse(this.body || '{}'); }
  };
}

async function call(method, url, body) {
  const res = response();
  await handler({ method, url, body }, res);
  return res;
}

test('path route and Vercel rewrite __route resolve to same handler', () => {
  assert.equal(handler._private.routeName({ url: '/api/roblox/world?world=starter' }), 'world');
  assert.equal(handler._private.routeName({ url: '/api/roblox?__route=world&world=starter' }), 'world');
});

test('GET world returns v3 WorldSpec and no-store headers', async () => {
  const res = await call('GET', '/api/roblox/world?world=starter');
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers['cache-control'], 'no-store');
  assert.equal(res.headers['x-content-type-options'], 'nosniff');
  const body = res.json();
  assert.equal(body.revision, 'worldspec-v3');
  assert.equal(body.npcs[0].id, 'guide');
});

test('GET chunk returns 13 canonical resource objects', async () => {
  const res = await call('GET', '/api/roblox/chunk?world=starter&cx=0&cz=0');
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.objects.length, 13);
  assert.equal(body.objects[0].id, 'r:0:0:0');
});

test('POST handshake returns capabilities', async () => {
  const res = await call('POST', '/api/roblox/handshake', { worldId: 'starter' });
  assert.equal(res.statusCode, 200);
  const body = res.json();
  assert.equal(body.protocol, 3);
  assert.equal(body.capabilities.delta, true);
});

test('wrong method is rejected with Allow header', async () => {
  const res = await call('POST', '/api/roblox/world', {});
  assert.equal(res.statusCode, 405);
  assert.equal(res.headers.allow, 'GET');
});

test('unknown route is 404', async () => {
  const res = await call('GET', '/api/roblox/admin');
  assert.equal(res.statusCode, 404);
  assert.match(res.json().error, /not found/i);
});

test('authoritative rejection is a conflict response', async () => {
  const res = await call('POST', '/api/roblox/action', { action: 'talk', payload: { objectId: 'guide', playerPosition: { x: 1000, y: 2, z: 0 } } });
  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.json(), { accepted: false, reason: 'too_far' });
});

test('events ack is bounded and explicitly non-durable', async () => {
  const ok = await call('POST', '/api/roblox/events', { worldId: 'starter', events: [{ type: 'ready' }] });
  assert.equal(ok.statusCode, 202);
  assert.deepEqual(ok.json(), { accepted: true, kind: 'events', count: 1, worldId: 'starter', durable: false });
  const bad = await call('POST', '/api/roblox/events', { events: Array(21).fill({ type: 'x' }) });
  assert.equal(bad.statusCode, 400);
});

test('replay ack allows 40 but rejects 41', async () => {
  const ok = await call('POST', '/api/roblox/replay', { events: Array(40).fill({ type: 'x' }) });
  assert.equal(ok.statusCode, 202);
  const bad = await call('POST', '/api/roblox/replay', { events: Array(41).fill({ type: 'x' }) });
  assert.equal(bad.statusCode, 400);
});

test('telemetry requires object metrics', async () => {
  const ok = await call('POST', '/api/roblox/telemetry', { worldId: 'starter', metrics: { fps: 60 } });
  assert.equal(ok.statusCode, 202);
  assert.equal(ok.json().durable, false);
  const bad = await call('POST', '/api/roblox/telemetry', { metrics: [] });
  assert.equal(bad.statusCode, 400);
});

test('NPC channel is deterministic, not falsely advertised as live LLM', async () => {
  const res = await call('POST', '/api/roblox/npc', { npcId: 'guide', text: 'Привет' });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().npcId, 'guide');
  assert.match(res.json().npcReply, /Привет/);
});
