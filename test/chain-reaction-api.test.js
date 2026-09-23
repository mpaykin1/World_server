'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { handle } = require('../lib/chain-reaction-api');
const engine = require('../lib/world-consequence-engine');
const clone = x => JSON.parse(JSON.stringify(x));
function fixture(options = {}) {
  let row = { id: 'city', seed: 42, updated_at: '2026-09-23T00:00:00.000Z', settings: { worldDNA: { preserved: true } } };
  const memberships = new Map(options.member ? [['city:user-1', { role: options.member }]] : []);
  let writes = 0;
  const admin = {
    auth: { getUser: async token => ({ data: { user: token === 'valid' ? {
      id: 'user-1', app_metadata: { chain_reaction_worlds: options.denied ? [] : ['city'] },
      user_metadata: { chain_reaction_worlds: ['city'] }
    } : null }, error: null }) },
    from(table) {
      const filters = []; let patch;
      return {
        select() { return this; }, eq(k, v) { filters.push([k, v]); return this; },
        update(value) { patch = value; return this; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { username: 'Tester' } };
          if (options.dbError) return { error: { code: 'database_error' } };
          if (options.missing) return { data: null };
          if (table === 'chain_reaction_world_members') {
            const values = Object.fromEntries(filters);
            return { data: memberships.get(`${values.world_id}:${values.user_id}`) || null };
          }
          if (!patch) return { data: clone(row) };
          assert.deepEqual(filters.map(x => x[0]), ['id', 'updated_at']);
          if (options.conflict || !filters.every(([k, v]) => row[k] === v)) return { data: null };
          row = { ...row, ...clone(patch) }; writes++; return { data: { id: row.id } };
        }
      };
    }
  };
  return { admin, get row() { return row; }, get writes() { return writes; } };
}
const req = { headers: { authorization: 'Bearer valid' } };
const body = (action, extra = {}) => ({ action, worldId: 'city', structure: 'solar', text: '', ...extra });
const rejects = (promise, status) => assert.rejects(promise, e => e.status === status);

test('intent and preview are read-only; forged compiled intent is ignored', async () => {
  const f = fixture();
  const interpreted = await handle(f.admin, req, body('interpret-intent'));
  assert.equal(interpreted.intent.goal, 'solar');
  const preview = await handle(f.admin, req, body('preview-plan', { intent: { goal: 'solar', timeline: 0 }, cost: -100 }));
  assert.equal(preview.plan.cost, 40); assert.equal(preview.plan.buildTicks, 2);
  assert.equal(f.writes, 0);
});
test('commit and ticks persist engine output, provenance and unrelated settings; history paginates', async () => {
  const f = fixture();
  const committed = await handle(f.admin, req, body('commit-plan', { expectedRevision: 0 }));
  assert.equal(committed.world.resources.budget, 110);
  assert.equal(committed.world.projects[0].intent.schemaVersion, 1);
  assert.deepEqual(f.row.settings.worldDNA, { preserved: true });
  const expected = engine.simulateTicks(committed.world, 3);
  const result = await handle(f.admin, req, body('tick', { expectedRevision: 1, count: 3 }));
  assert.deepEqual(result.world.resources, expected.resources);
  assert.equal(result.revision, 4); assert.equal(f.writes, 2);
  const history = await handle(f.admin, req, body('history', { offset: 1, limit: 1 }));
  assert.equal(history.history[0].actorId, 'user-1'); assert.equal(history.nextOffset, 2);
  await rejects(handle(f.admin, req, body('commit-plan', { expectedRevision: 0 })), 409);
  assert.equal(f.writes, 2);
});
test('missing/invalid tokens never fall back to guest; user_metadata is not a grant', async () => {
  const f = fixture();
  for (const headers of [{}, { authorization: 'Bearer invalid' }]) {
    await rejects(handle(f.admin, { headers }, body('tick', { guestId: 'forged', expectedRevision: 0 })), 401);
  }
  await rejects(handle(fixture({ denied: true }).admin, req, body('history')), 403);
  await rejects(handle(f.admin, req, body('history', { worldId: 'other' })), 403);
  assert.equal(f.writes, 0);
});

test('canonical private membership authorizes without a shared JWT grant', async () => {
  const f = fixture({ denied: true, member: 'owner' });
  const result = await handle(f.admin, req, body('history'));
  assert.equal(result.worldId, 'city');
  await rejects(handle(fixture({ denied: true }).admin, req, body('history')), 403);
});
test('CAS conflict fails without replay; simultaneous commits have exactly one winner', async () => {
  await rejects(handle(fixture({ conflict: true }).admin, req, body('tick', { expectedRevision: 0 })), 409);
  const f = fixture();
  const results = await Promise.allSettled([1, 2].map(() => handle(f.admin, req, body('commit-plan', { expectedRevision: 0 }))));
  assert.equal(results.filter(x => x.status === 'fulfilled').length, 1);
  assert.equal(results.find(x => x.status === 'rejected').reason.status, 409);
  assert.equal(f.writes, 1); assert.equal(f.row.settings.chainReaction.projects.length, 1);
});
test('bounded requests, own project names and strict numeric revisions', async () => {
  const f = fixture();
  for (const input of [null, [], body('unknown'), body('preview-plan', { structure: '__proto__' }),
    body('preview-plan', { structure: 'constructor' }), body('preview-plan', { text: 'x'.repeat(601) }),
    body('tick', { expectedRevision: '0' }), body('tick', { expectedRevision: 0, count: 25 }),
    body('history', { limit: 101 }), body('history', { offset: -1 })]) await rejects(handle(f.admin, req, input), 400);
  await rejects(handle(f.admin, req, body('history', { padding: 'x'.repeat(8192) })), 413);
  assert.equal(f.writes, 0);
});
test('missing worlds and database failures fail closed', async () => {
  await rejects(handle(fixture({ missing: true }).admin, req, body('history')), 404);
  await rejects(handle(fixture({ dbError: true }).admin, req, body('history')), 500);
});
test('infeasible commits leave persistent state untouched', async () => {
  const f = fixture();
  f.row.settings.chainReaction = engine.createWorld('test');
  f.row.settings.chainReaction.resources.budget = 0;
  await rejects(handle(f.admin, req, body('commit-plan', { expectedRevision: 0 })), 409);
  assert.equal(f.writes, 0);
});
