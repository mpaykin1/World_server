'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { canonEventEntry, eventFocus, projectEventEntry } = require('../lib/world-canon');

const KEY = 'a'.repeat(64);
const OTHER = 'b'.repeat(64);

function database() {
  const state = {
    writes: 0,
    rows: [
      { event_key: KEY, world_id: 'main', revision: 7, event_type: 'dragon_arrival', summary: 'Dragon arrived.', payload: { region: ' north-gate\n ', x: 12.34567, y: 4, z: -8, secret: 'not-focus' }, actor_ref: 'actor-' + '1'.repeat(24), visibility_scope: 'public' },
      { event_key: OTHER, world_id: 'main', revision: 9, event_type: 'dragon_defense', summary: 'Archers answered.', payload: {}, actor_ref: 'actor-' + '2'.repeat(24), visibility_scope: 'public' },
      { event_key: 'c'.repeat(64), world_id: 'other-world', revision: 10, visibility_scope: 'public', payload: {} },
      { event_key: 'd'.repeat(64), world_id: 'main', revision: 11, visibility_scope: 'private', payload: {} }
    ]
  };
  class Query {
    constructor() { this.filters = {}; this.sort = null; this.count = Infinity; }
    select() { return this; }
    eq(key, value) { this.filters[key] = value; return this; }
    order(key, options) { this.sort = { key, ascending: options?.ascending !== false }; return this; }
    limit(value) { this.count = value; return this; }
    async maybeSingle() {
      let rows = state.rows.filter(row => Object.entries(this.filters).every(([key, value]) => row[key] === value));
      if (this.sort) rows.sort((a, b) => (a[this.sort.key] - b[this.sort.key]) * (this.sort.ascending ? 1 : -1));
      return { data: rows.slice(0, this.count)[0] || null, error: null };
    }
  }
  return { state, admin: { from(table) { assert.equal(table, 'world_canon_events'); return new Query(); } } };
}

test('stable event entry resolves the exact public event and reports an advanced authoritative world', async () => {
  const { admin, state } = database();
  const entry = await canonEventEntry(admin, { worldId: 'main', eventKey: KEY });
  assert.equal(entry.event.event_key, KEY);
  assert.equal(entry.eventRevision, 7);
  assert.equal(entry.currentRevision, 9);
  assert.equal(entry.state, 'historical');
  assert.equal(entry.canContinue, true);
  assert.deepEqual(entry.focus, { region: 'north-gate', x: 12.346, y: 4, z: -8 });
  assert.equal(state.writes, 0);
});

test('event entry fails closed for cross-world, private and malformed event keys', async () => {
  const { admin } = database();
  await assert.rejects(canonEventEntry(admin, { worldId: 'main', eventKey: 'c'.repeat(64) }), error => error.status === 404);
  await assert.rejects(canonEventEntry(admin, { worldId: 'main', eventKey: 'd'.repeat(64) }), error => error.status === 404);
  await assert.rejects(canonEventEntry(admin, { worldId: 'main', eventKey: '../event' }), error => error.status === 400);
});

test('focus projection is bounded and never trusts arbitrary event payload fields', () => {
  assert.deepEqual(eventFocus({ region: 'r'.repeat(100), x: 1000001, y: Infinity, z: '2.25', actor_id: 'private' }), { region: 'r'.repeat(80), z: 2.25 });
  assert.throws(() => projectEventEntry({ revision: 9, payload: {} }, 8), /Invalid canon revision/);
});

test('Node and Edge expose the same public event-entry contract without a second route or event store', () => {
  const root = path.resolve(__dirname, '..');
  const node = fs.readFileSync(path.join(root, 'lib', 'world-canon.js'), 'utf8')
    + fs.readFileSync(path.join(root, 'lib', 'api-handlers', 'canon.js'), 'utf8');
  const edge = fs.readFileSync(path.join(root, 'supabase', 'functions', 'world-stack', 'index.ts'), 'utf8');
  for (const source of [node, edge]) {
    assert.match(source, /eventKey/);
    assert.match(source, /CANON_EVENT_NOT_FOUND/);
    assert.match(source, /visibility_scope['"],?\s*['"]public/);
    assert.match(source, /historical/);
    assert.match(source, /canContinue/);
  }
});
