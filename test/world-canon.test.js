'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { actorRefFor, planCanonMutation, eventKeyFor, persistCanonMutation } = require('../lib/world-canon');

const root = path.resolve(__dirname, '..');
const loreBible = JSON.parse(fs.readFileSync(path.join(root, 'data', 'world-lore-v2.json'), 'utf8').replace(/^\uFEFF/, ''));

test('canon event keys are deterministic and idempotent', () => {
  const a = eventKeyFor({ worldId: 'main', eventType: 'player_world_change', idempotencyKey: 'action-1' });
  const b = eventKeyFor({ worldId: 'main', eventType: 'player_world_change', idempotencyKey: 'action-1' });
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/);
});

test('authored continuation is privacy-safe, stable and causally linked', () => {
  const actorA = '11111111-1111-4111-8111-111111111111';
  const actorB = '22222222-2222-4222-8222-222222222222';
  const parent = eventKeyFor({ worldId: 'main', eventType: 'dragon_arrival', idempotencyKey: 'arrival-1' });
  const plan = planCanonMutation({
    worldId: 'main', eventType: 'dragon_defense', summary: 'Другой житель продолжил защиту.',
    payload: { region: 'north-gate' }, idempotencyKey: 'defense-1', actorRef: actorRefFor(actorB),
    parentEventKey: parent, sourcePlatform: 'telegram', loreBible: { worlds: {} }
  });
  assert.equal(actorRefFor(actorA), actorRefFor(actorA));
  assert.notEqual(actorRefFor(actorA), actorRefFor(actorB));
  assert.match(plan.source.actor_ref, /^actor-[0-9a-f]{24}$/);
  assert.equal(plan.source.parent_event_key, parent);
  assert.equal(plan.source.cause_event_key, parent);
  assert.equal(plan.source.source_platform, 'telegram');
  assert.equal(plan.source.visibility_scope, 'public');
  assert.doesNotMatch(JSON.stringify(plan), new RegExp(actorB));
});

test('canon authors accept authenticated UUIDs only', () => {
  assert.match(actorRefFor('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), /^actor-[0-9a-f]{24}$/);
  for (const malformed of [
    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
    '------------------------------------',
    'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    '00000000-0000-0000-0000-000000000000',
    ''
  ]) assert.throws(() => actorRefFor(malformed), /Invalid canon actor/);
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
  const admin = { from(table) { assert.equal(table, 'world_canon_events'); return {
    upsert(rows, options) { batches.push({ rows, options }); return this; },
    select() { return this; },
    async in(key, values) {
      assert.equal(key, 'event_key');
      return { data: batches.at(-1).rows.filter(row => values.includes(row.event_key)).map((row, index) => ({ ...row, revision: index + 1 })), error: null };
    },
    then(resolve) { return Promise.resolve({ data: null, error: null }).then(resolve); }
  }; } };
  const plan = planCanonMutation({ worldId: 'main', eventType: 'player_world_change', summary: 'Игроки изменили общий мир.', payload: {}, idempotencyKey: 'action-4', loreBible });
  const result = await persistCanonMutation(admin, plan);
  assert.equal(batches.length, 1);
  assert.deepEqual(batches[0].options, { onConflict: 'event_key', ignoreDuplicates: true });
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

test('canon migration adds immutable revisions, pseudonymous authors and causal parents to the existing ledger', () => {
  const migration = fs.readFileSync(path.join(root, 'supabase', 'migrations', '20261002230000_world_canon_social_lineage.sql'), 'utf8');
  assert.match(migration, /alter table public\.world_canon_events[\s\S]+revision bigint generated always as identity/i);
  assert.match(migration, /parent_event_key text references public\.world_canon_events\(event_key\)/i);
  assert.match(migration, /actor_ref text not null default 'legacy'/i);
  assert.match(migration, /source_platform in \('browser', 'telegram', 'world_server'\)/i);
  assert.match(migration, /visibility_scope = 'public'/i);
  assert.doesNotMatch(migration, /telegram_user_id|auth_user_id/i);
  assert.match(migration, /before update or delete on public\.world_canon_events/i);
  assert.match(migration, /raise exception 'world_canon_events is append-only'/i);
  assert.match(migration, /revoke update, delete on table public\.world_canon_events from anon, authenticated/i);
});


test('cross-world canon consequences carry deterministic gameplay effects that rehydrate after reconnect', () => {
  const plan = planCanonMutation({ worldId: 'main', eventType: 'player_world_change', summary: 'A gate changed.', payload: {}, idempotencyKey: 'effect-1', loreBible });
  assert.ok(plan.consequences.length > 0);
  for (const event of plan.consequences) {
    assert.equal(event.payload.effect.kind, 'canon_beacon');
    assert.match(event.payload.effect.effectId, /^canon-[0-9a-f]{16}$/);
    assert.equal(event.payload.effect.lifetimeMs, 86400000);
  }
  const client = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'client.js'), 'utf8');
  assert.match(client, /function applyCanonEffect/);
  assert.match(client, /async function hydrateCanon/);
  assert.match(client, /updateCanonEffects\(now\)/);
  assert.match(client, /void hydrateCanon\(\)/);
  assert.match(client, /for\(let attempt=0;attempt<2;attempt\+\+\)/);
  assert.match(client, /error\.retryable=r\.status>=500/);
  assert.match(client, /const body=JSON\.stringify\([\s\S]*?idempotencyKey/);
  assert.match(client, /canonEl\.textContent='канон: '/);
  assert.match(client, /canon:\{seen:canonSeen\.size,visibleEffects:canonEffects\.size/);
  const html = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'index.html'), 'utf8');
  assert.match(html, /id="vwCanon" role="status" aria-live="polite"/);
});
