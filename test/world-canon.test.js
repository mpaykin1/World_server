'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { planCanonMutation, eventKeyFor, persistCanonMutation } = require('../lib/world-canon');

const root = path.resolve(__dirname, '..');
const loreBible = JSON.parse(fs.readFileSync(path.join(root, 'data', 'world-lore-v2.json'), 'utf8').replace(/^\uFEFF/, ''));

test('canon event keys are deterministic and idempotent', () => {
  const a = eventKeyFor({ worldId: 'main', eventType: 'player_world_change', idempotencyKey: 'action-1' });
  const b = eventKeyFor({ worldId: 'main', eventType: 'player_world_change', idempotencyKey: 'action-1' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('a player action in the voxel world creates durable cross-world consequences from authored lore', () => {
  const plan = planCanonMutation({
    worldId: 'main',
    eventType: 'player_world_change',
    summary: 'Игроки изменили общий мир.',
    payload: { x: 1, y: 22, z: 3, blockType: 10 },
    idempotencyKey: 'action-2',
    loreBible
  });
  assert.equal(plan.source.world_id, 'main');
  assert.ok(plan.consequences.length >= 1);
  assert.ok(plan.consequences.every(x => x.cause_event_key === plan.source.event_key));
  assert.ok(plan.consequences.every(x => x.event_type === 'cross_world_consequence'));
  assert.ok(plan.consequences.some(x => x.target_world_id === 'world-sharabass'));
});

test('player-created World DNA lore drives its own canon bridge', () => {
  const settings = { lore: { connections: [{ targetId: 'voxel-world', story: 'Старинный портал снова загорелся.' }] } };
  const plan = planCanonMutation({
    worldId: 'world-320159ebe3219112', eventType: 'player_world_change', summary: 'Игрок открыл портал.',
    payload: {}, idempotencyKey: 'action-3', worldSettings: settings, loreBible
  });
  assert.equal(plan.consequences.length, 1);
  assert.equal(plan.consequences[0].target_world_id, 'voxel-world');
  assert.match(plan.consequences[0].summary, /портал/iu);
});

test('canon persistence upserts the source event and all consequences atomically as one batch', async () => {
  const batches = [];
  const admin = { from(table) { assert.equal(table, 'world_canon_events'); return { upsert(rows, options) { batches.push({ rows, options }); return this; }, async select() { return { data: batches.at(-1).rows, error: null }; } }; } };
  const plan = planCanonMutation({ worldId: 'main', eventType: 'player_world_change', summary: 'Игроки изменили общий мир.', payload: {}, idempotencyKey: 'action-4', loreBible });
  const result = await persistCanonMutation(admin, plan);
  assert.equal(batches.length, 1);
  assert.equal(batches[0].options.onConflict, 'event_key');
  assert.equal(batches[0].rows.length, 1 + plan.consequences.length);
  assert.equal(result.persisted.length, batches[0].rows.length);
});

test('voxel client periodically promotes player edits into canon and listens for realtime consequences', () => {
  const client = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'client.js'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20260911102000_world_canon_events.sql'), 'utf8');
  assert.match(client, /canonEditCount%20===0/);
  assert.match(client, /scienceEvents\.length\|\|canonEditCount%20===0/);
  assert.match(client, /table:'world_canon_events'/);
  assert.match(migration, /supabase_realtime add table public\.world_canon_events/);
  assert.match(migration, /grant select on table public\.world_canon_events to anon, authenticated/);
});
