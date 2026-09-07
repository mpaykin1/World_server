'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  handleHandshake,
  handleWorld,
  handleChunk,
  handleDelta,
  handleAction,
  handleEvents,
  handleTelemetry,
  handleReplay,
  handleNpc,
  isAllowedCloudRunUrl,
  resetRateLimits
} = require('../lib/roblox-adapter');

function createMockRes() {
  const state = { statusCode: 200, headers: {}, body: '' };
  const res = {
    get statusCode() { return state.statusCode; },
    set statusCode(val) { state.statusCode = val; },
    setHeader(k, v) { state.headers[k.toLowerCase()] = v; },
    end(val) { state.body = String(val || ''); }
  };
  return { res, get status() { return state.statusCode; }, get json() { return JSON.parse(state.body || '{}'); } };
}

function mockReq(method, url, bodyObj = null, headersObj = {}) {
  const reqStream = new (require('stream').Readable)();
  reqStream.method = method;
  reqStream.url = url;
  reqStream.headers = Object.assign({ host: 'localhost' }, headersObj);
  if (bodyObj !== null) reqStream.push(typeof bodyObj === 'string' ? bodyObj : JSON.stringify(bodyObj));
  reqStream.push(null);
  return reqStream;
}

async function call(handler, method, url, body = null, headers = {}) {
  const mock = createMockRes();
  await handler(mockReq(method, url, body, headers), mock.res);
  return mock;
}

test('handshake negotiates only protocol 3 and advertises v3 capabilities', async () => {
  const good = await call(handleHandshake, 'POST', '/api/roblox/handshake', { protocol: 3 });
  assert.equal(good.status, 200);
  assert.equal(good.json.protocol, 3);
  assert.equal(good.json.serverVersion, '3.0.0');
  for (const cap of ['chunks', 'delta', 'authoritativeActions', 'events', 'replay', 'npc', 'telemetry']) assert.equal(good.json.capabilities[cap], true);
  const old = await call(handleHandshake, 'POST', '/api/roblox/handshake', { protocol: 2 });
  assert.equal(old.status, 400);
  assert.equal(old.json.protocol, 3);
  assert.match(old.json.error, /Unsupported protocol/);
});

test('Cloud Run failover allowlist is HTTPS-only and rejects lookalikes', () => {
  assert.equal(isAllowedCloudRunUrl('https://world-server-abc-uc.a.run.app'), true);
  assert.equal(isAllowedCloudRunUrl('http://world-server.run.app'), false);
  assert.equal(isAllowedCloudRunUrl('https://run.app.evil.example'), false);
  assert.equal(isAllowedCloudRunUrl('https://evil.example'), false);
});

test('world and chunk remain bounded on protocol 3', async () => {
  const world = await call(handleWorld, 'GET', '/api/roblox/world?id=voxel-world');
  assert.equal(world.status, 200);
  assert.equal(world.json.protocol, 3);
  assert.equal(world.json.worlds.length, 1);
  assert.ok(world.json.worlds[0].revision);
  assert.ok(world.json.worlds[0].cursor);

  const chunk = await call(handleChunk, 'GET', '/api/roblox/chunk?worldId=voxel-world&x=100&y=-50&z=0');
  assert.equal(chunk.status, 200);
  assert.equal(chunk.json.protocol, 3);
  assert.equal(chunk.json.chunk.x, 10);
  assert.equal(chunk.json.chunk.y, -10);
  assert.equal(chunk.json.chunk.voxels.length, 64);
  const bad = await call(handleChunk, 'GET', '/api/roblox/chunk?x=NaN');
  assert.equal(bad.status, 400);
});

test('delta is bounded and advances to canonical world revision cursor', async () => {
  const delta = await call(handleDelta, 'GET', '/api/roblox/delta?worldId=voxel-world&cursor=c1&limit=9999');
  assert.equal(delta.status, 200);
  assert.equal(delta.json.protocol, 3);
  assert.equal(delta.json.limit, 300);
  assert.equal(delta.json.previousCursor, 'c1');
  assert.ok(Array.isArray(delta.json.operations));
  assert.ok(delta.json.cursor.startsWith('world:voxel-world:'));
});

test('authoritative action allowlist, position clamps, and rejection are fail-closed', async () => {
  resetRateLimits();
  const accepted = await call(handleAction, 'POST', '/api/roblox/action', {
    action: 'interact', worldId: 'voxel-world', targetId: 'npc-1', playerPosition: { x: 1e99, y: -1e99, z: 'bad' }
  });
  assert.equal(accepted.status, 200);
  assert.equal(accepted.json.accepted, true);
  assert.deepEqual(accepted.json.playerPosition, { x: 50000, y: -50000, z: 0 });
  const rejected = await call(handleAction, 'POST', '/api/roblox/action', { action: 'eval' });
  assert.equal(rejected.status, 400);
  assert.equal(rejected.json.accepted, false);
});

test('events remain type/payload bounded', async () => {
  resetRateLimits();
  const good = await call(handleEvents, 'POST', '/api/roblox/events', { events: [{ type: 'player_join' }, { type: 'action' }] });
  assert.equal(good.status, 200);
  assert.equal(good.json.processed, 2);
  const bad = await call(handleEvents, 'POST', '/api/roblox/events', { events: [{ type: 'malicious_eval_type' }] });
  assert.equal(bad.status, 400);
});

test('replay enforces batch and payload bounds', async () => {
  resetRateLimits();
  const good = await call(handleReplay, 'POST', '/api/roblox/replay', { sequence: 10, events: [{ type: 'action' }, { type: 'portal_use' }] });
  assert.equal(good.status, 200);
  assert.equal(good.json.accepted, 2);
  assert.equal(good.json.nextSequence, 12);
  const tooMany = await call(handleReplay, 'POST', '/api/roblox/replay', { events: Array.from({ length: 41 }, () => ({ type: 'action' })) });
  assert.equal(tooMany.status, 400);
  const tooLarge = await call(handleReplay, 'POST', '/api/roblox/replay', { events: [{ type: 'action', data: 'x'.repeat(70 * 1024) }] });
  assert.equal(tooLarge.status, 413);
});

test('npc endpoint requires bounded identity/message and returns bounded fallback', async () => {
  resetRateLimits();
  const good = await call(handleNpc, 'POST', '/api/roblox/npc', { npcId: 'guide-1', message: 'Where is the portal?' });
  assert.equal(good.status, 200);
  assert.equal(good.json.protocol, 3);
  assert.equal(good.json.npcId, 'guide-1');
  assert.ok(good.json.npcReply.length < 1000);
  const bad = await call(handleNpc, 'POST', '/api/roblox/npc', { npcId: '', message: '' });
  assert.equal(bad.status, 400);
});

test('telemetry numeric fields are finite and clamped', async () => {
  resetRateLimits();
  const good = await call(handleTelemetry, 'POST', '/api/roblox/telemetry', { fps: 9999, memoryMB: -50, pingMs: 1000000 });
  assert.equal(good.status, 200);
  assert.equal(good.json.protocol, 3);
  assert.deepEqual(good.json.metrics, { fps: 240, memoryMB: 0, pingMs: 10000, client: 'roblox_studio' });
  const bad = await call(handleTelemetry, 'POST', '/api/roblox/telemetry', { fps: 'not_a_number' });
  assert.equal(bad.status, 400);
});
