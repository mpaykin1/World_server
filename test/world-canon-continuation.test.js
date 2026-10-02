'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');

const { record } = require('../lib/api-handlers/canon')._private;

const WORLD = 'main';
const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';
const OUTSIDER = '33333333-3333-4333-8333-333333333333';

function database() {
  const state = {
    participants: new Set([USER_A, USER_B]),
    worlds: new Map([[WORLD, { settings: {} }]]),
    events: new Map(),
    writes: 0,
    revision: 0
  };
  class Query {
    constructor(table) { this.table = table; this.filters = {}; this.rows = null; }
    select() { return this; }
    eq(key, value) { this.filters[key] = value; return this; }
    upsert(rows) { this.rows = rows; return this; }
    async maybeSingle() {
      if (this.table === 'voxel_player_states') {
        const ok = this.filters.world_id === WORLD && state.participants.has(this.filters.user_id);
        return { data: ok ? { id: `player-${this.filters.user_id}` } : null, error: null };
      }
      if (this.table === 'voxel_worlds') return { data: state.worlds.get(this.filters.id) || null, error: null };
      if (this.table === 'world_canon_events') return { data: state.events.get(this.filters.event_key) || null, error: null };
      return { data: null, error: null };
    }
    then(resolve, reject) {
      const work = async () => {
        if (this.table !== 'world_canon_events' || !this.rows) return { data: [], error: null };
        const persisted = [];
        for (const candidate of this.rows) {
          let row = state.events.get(candidate.event_key);
          if (!row) {
            row = { ...candidate, revision: ++state.revision, created_at: `2026-10-02T23:00:${String(state.revision).padStart(2, '0')}Z` };
            state.events.set(row.event_key, row);
            state.writes += 1;
          }
          persisted.push(row);
        }
        return { data: persisted, error: null };
      };
      return work().then(resolve, reject);
    }
  }
  return { state, admin: { from: table => new Query(table) } };
}

test('two independent actors persist and replay one same-world causal chain without raw identities', async () => {
  const { admin, state } = database();
  const first = await record(admin, {
    worldId: WORLD, eventType: 'dragon_arrival', summary: 'Прилетел дракон.', payload: { region: 'north-gate' },
    idempotencyKey: 'actor-a-arrival', sourcePlatform: 'browser'
  }, { id: USER_A });
  const parent = first.event.event_key;
  const secondBody = {
    worldId: WORLD, eventType: 'dragon_defense', summary: 'Лучники открыли огонь.', payload: { region: 'north-gate' },
    idempotencyKey: 'actor-b-defense', parentEventKey: parent, sourcePlatform: 'telegram'
  };
  const second = await record(admin, secondBody, { id: USER_B });
  const retry = await record(admin, secondBody, { id: USER_B });

  assert.notEqual(first.event.actor_ref, second.event.actor_ref);
  assert.equal(second.event.parent_event_key, parent);
  assert.equal(second.event.cause_event_key, parent);
  assert.equal(second.event.source_platform, 'browser');
  assert.equal(second.persisted[0].revision, retry.persisted[0].revision);
  assert.equal([...state.events.values()].filter(event => event.world_id === WORLD && event.event_type !== 'cross_world_consequence').length, 2);
  assert.equal(state.writes, state.events.size);
  assert.doesNotMatch(JSON.stringify([...state.events.values()]), new RegExp(`${USER_A}|${USER_B}`));
});

test('continuation rejects outsiders and cross-world parent forgery without writes', async () => {
  const { admin, state } = database();
  await assert.rejects(record(admin, {
    worldId: WORLD, eventType: 'dragon_arrival', summary: 'Поддельное событие.', payload: {}, idempotencyKey: 'outsider'
  }, { id: OUTSIDER }), error => error.status === 403);

  const foreignKey = 'a'.repeat(64);
  state.events.set(foreignKey, { event_key: foreignKey, world_id: 'other-world' });
  await assert.rejects(record(admin, {
    worldId: WORLD, eventType: 'dragon_defense', summary: 'Поддельное продолжение.', payload: {},
    idempotencyKey: 'cross-world', parentEventKey: foreignKey
  }, { id: USER_B }), error => error.status === 409 && error.message === 'PARENT_EVENT_NOT_IN_WORLD');
  assert.equal(state.writes, 0);
});
