'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../lib/roblox-bridge');

test('handshake advertises v3 and all client capabilities', () => {
  const value = bridge.buildHandshake({ worldId: 'starter' }, {});
  assert.equal(value.protocol, 3);
  assert.equal(value.bridgeVersion, '3.0.0');
  for (const key of ['chunks','delta','authoritativeActions','events','replay','npc','telemetry','lod','universalIds','predictivePrefetch']) {
    assert.equal(value.capabilities[key], true, key);
  }
});

test('handshake accepts only canonical HTTPS run.app Cloud Run URL', () => {
  const ok = bridge.buildHandshake({}, { CLOUD_RUN_PUBLIC_URL: 'https://world-server-abc-uc.a.run.app' });
  assert.equal(ok.cloudRunUrl, 'https://world-server-abc-uc.a.run.app');
  for (const bad of ['http://world-server.run.app','https://run.app.evil.example','https://x.run.app/path','https://user@x.run.app']) {
    assert.equal(bridge.buildHandshake({}, { CLOUD_RUN_PUBLIC_URL: bad }).cloudRunUrl, undefined, bad);
  }
});

test('world id is bounded and safe', () => {
  assert.equal(bridge.normalizeWorldId('HELLO-world_2'), 'hello-world_2');
  assert.equal(bridge.normalizeWorldId('../../etc/passwd'), 'starter');
});

test('universal ids are stable and path-safe', () => {
  assert.equal(bridge.universalId('starter','npc','guide-1'), 'world://starter/npc/guide-1');
  assert.equal(bridge.universalId('starter','../npc','a/b?x'), 'world://starter/npc/abx');
});

test('world spec has a grounded base, guide and portal', () => {
  const world = bridge.buildWorldSpec('starter');
  assert.equal(world.revision, 'worldspec-v3');
  assert.equal(world.cursor, '0');
  assert.equal(world.ground.position[1], -0.5);
  assert.equal(world.npcs[0].id, 'guide');
  assert.equal(world.portals[0].id, 'p1');
});

test('chunk generation reuses deterministic canonical game rules', () => {
  const a = bridge.buildChunkSpec('starter', 2, -3);
  const b = bridge.buildChunkSpec('starter', 2, -3);
  assert.deepEqual(a, b);
  assert.equal(a.objects.length, 13);
  assert.equal(a.objects[0].id, 'r:2:-3:0');
  assert.match(a.objects[0].universalId, /^world:\/\/starter\/resource\/r:2:-3:0$/);
});

test('chunk coordinates clamp to server world bound', () => {
  assert.equal(bridge.buildChunkSpec('starter', 1e50, -1e50).cx, 10000);
  assert.equal(bridge.buildChunkSpec('starter', 1e50, -1e50).cz, -10000);
});

test('resource IDs are regenerated and verified, not trusted', () => {
  const valid = bridge.parseResourceId('r:0:0:0');
  assert.equal(valid.id, 'r:0:0:0');
  assert.equal(bridge.parseResourceId('r:0:0:13'), null);
  assert.equal(bridge.parseResourceId('r:10001:0:0'), null);
  assert.equal(bridge.parseResourceId('../../etc'), null);
});

test('delta starts as bounded safe no-op', () => {
  const value = bridge.buildDelta({ world: 'starter', revision: 'r1', cursor: 'c1' });
  assert.deepEqual(value.operations, []);
  assert.equal(value.revision, 'r1');
  assert.equal(value.cursor, 'c1');
});

test('authoritative action rejects unknown action', () => {
  assert.deepEqual(bridge.handleAuthoritativeAction({ action: 'admin_delete_everything' }), { accepted: false, reason: 'action_not_allowed' });
});

test('guide talk requires real nearby player position', () => {
  const missing = bridge.handleAuthoritativeAction({ action: 'talk', payload: { objectId: 'guide' } });
  assert.deepEqual(missing, { accepted: false, reason: 'missing_player_position' });
  const far = bridge.handleAuthoritativeAction({ action: 'talk', payload: { objectId: 'guide', playerPosition: { x: 1000, y: 2, z: 0 } } });
  assert.deepEqual(far, { accepted: false, reason: 'too_far' });
  const near = bridge.handleAuthoritativeAction({ action: 'talk', payload: { objectId: 'guide', playerPosition: { x: 10, y: 2, z: 1 } } });
  assert.equal(near.accepted, true);
  assert.equal(near.npcId, 'guide');
  assert.ok(near.npcReply.length <= 1000);
});

test('portal action is server-authoritative and proximity checked', () => {
  const near = bridge.handleAuthoritativeAction({ action: 'enter_portal', payload: { objectId: 'p1', playerPosition: { x: 0, y: 6, z: -19 } } });
  assert.deepEqual(near, { accepted: true, targetWorld: 'starter' });
  const far = bridge.handleAuthoritativeAction({ action: 'enter_portal', payload: { objectId: 'p1', playerPosition: { x: 0, y: 6, z: 50 } } });
  assert.deepEqual(far, { accepted: false, reason: 'too_far' });
});

test('resource interaction verifies deterministic target and distance', () => {
  const resource = bridge.parseResourceId('r:0:0:0');
  const close = { x: resource.position.x, y: 0, z: resource.position.z };
  const accepted = bridge.handleAuthoritativeAction({ action: 'interact', payload: { objectId: resource.id, playerPosition: close } });
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.objectId, resource.id);
  const rejected = bridge.handleAuthoritativeAction({ action: 'interact', payload: { objectId: resource.id, playerPosition: { x: close.x + 100, y: 0, z: close.z } } });
  assert.deepEqual(rejected, { accepted: false, reason: 'too_far' });
});

test('events/replay batches are bounded to match Roblox client and 64KiB server cap', () => {
  assert.deepEqual(bridge.validateBatch('events', { events: Array(20).fill({ type: 'x' }) }), { ok: true, count: 20 });
  assert.deepEqual(bridge.validateBatch('events', { events: Array(21).fill({ type: 'x' }) }), { ok: false, reason: 'batch_too_large', limit: 20 });
  assert.deepEqual(bridge.validateBatch('replay', { events: Array(40).fill({ type: 'x' }) }), { ok: true, count: 40 });
  assert.deepEqual(bridge.validateBatch('replay', { events: Array(41).fill({ type: 'x' }) }), { ok: false, reason: 'batch_too_large', limit: 40 });
});

test('NPC endpoint remains deterministic and bounded until a real AI provider is wired', () => {
  const value = bridge.buildNpcReply({ npcId: 'guide', text: 'Привет' });
  assert.equal(value.accepted, true);
  assert.equal(value.npcId, 'guide');
  assert.ok(value.npcReply.includes('Привет'));
  assert.ok(value.npcReply.length <= 1000);
  assert.deepEqual(bridge.buildNpcReply({ npcId: 'unknown' }), { accepted: false, reason: 'unknown_npc' });
});

test('telemetry validator rejects array/non-object metrics', () => {
  assert.deepEqual(bridge.validateTelemetry({ metrics: { fps: 60 } }), { ok: true });
  assert.deepEqual(bridge.validateTelemetry({ metrics: [] }), { ok: false, reason: 'invalid_metrics' });
});
