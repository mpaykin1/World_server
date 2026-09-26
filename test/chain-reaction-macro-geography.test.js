'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const engine = require('../lib/world-consequence-engine');
const { syncGeography } = require('../supabase/functions/_shared/chain-reaction-geography.js');
const voxel = require('../api/voxel')._private;
const { handle } = require('../lib/chain-reaction-api');
const clone = value => JSON.parse(JSON.stringify(value));
const OWNER = '11111111-1111-4111-8111-111111111111';
const request = { headers: { authorization: 'Bearer valid' } };
function fixture() {
  let row = { id: 'city', seed: 1, settings: { worldDNA: { preserved: true } },
    updated_at: '2026-09-26T00:00:00.000Z' };
  let writes = 0, conflictOnce = false;
  const admin = {
    auth: { getUser: async () => ({ data: { user: { id: OWNER } }, error: null }) },
    from(table) {
      const filters = {}; let patch = null;
      return { select() { return this; }, eq(k, v) { filters[k] = v; return this; },
        update(value) { patch = value; return this; },
        async single() { assert.equal(table, 'voxel_worlds'); return { data: clone(row), error: null }; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { username: 'Tester' }, error: null };
          if (table === 'chain_reaction_world_members') return { data: { role: 'owner' }, error: null };
          assert.equal(table, 'voxel_worlds');
          if (patch) {
            if (conflictOnce) { conflictOnce = false; return { data: null, error: null }; }
            if (filters.updated_at !== row.updated_at) return { data: null, error: null };
            row = { ...row, ...clone(patch) }; writes++;
          }
          return { data: clone(row), error: null };
        }
      };
    },
    async rpc(name, params) {
      assert.equal(name, 'commit_chain_reaction_action');
      if (params.p_expected_updated_at !== row.updated_at) return { data: false, error: null };
      row = { ...row, settings: clone(params.p_public_settings), updated_at: params.p_next_updated_at };
      writes++; return { data: true, error: null };
    }
  };
  return { admin, get row() { return row; }, get writes() { return writes; },
    injectConflict() { conflictOnce = true; } };
}
const place = (f, type, x) => voxel.actionMacroPlace(f.admin, { guestId: 'guest-no-private-access' },
  { worldId: 'city', type, position: { x, y: 42, z: 0 } });
const action = (f, name, extra = {}) => handle(f.admin, request,
  { action: name, worldId: 'city', structure: 'geothermal', text: 'geothermal research', ...extra });
test('map is authoritative: a placed volcano enables real delayed geothermal construction', async () => {
  const f = fixture();
  await place(f, 'city', 0);
  const cityOnly = await action(f, 'game-state');
  assert.equal(cityOnly.world.land.volcano, false);
  const oldRevision = cityOnly.revision;
  await place(f, 'volcano', 28);
  const fresh = await action(f, 'game-state');
  assert.equal(fresh.world.land.volcano, true);
  assert.equal(fresh.world.revision, fresh.revision);
  assert(fresh.revision > oldRevision);
  assert.equal(fresh.world.resources.power, cityOnly.world.resources.power);
  assert.deepEqual(f.row.settings.worldDNA.emergence.entities.map(e => e.type), ['city', 'volcano']);
  const preview = await action(f, 'preview-plan');
  assert.equal(preview.plan.feasible, true);
  await assert.rejects(action(f, 'commit-plan', { expectedRevision: oldRevision }), e => e.status === 409);
  const committed = await action(f, 'commit-plan', { expectedRevision: fresh.revision });
  assert.equal(committed.world.resources.power, fresh.world.resources.power);
  assert.equal(committed.world.resources.budget, fresh.world.resources.budget - preview.plan.cost);
  const reloaded = await action(f, 'game-state');
  assert.deepEqual(reloaded.world, committed.world);
  let ticked = reloaded;
  for (let n = 0; n < preview.plan.buildTicks; n++) {
    const beforePower = ticked.world.resources.power;
    ticked = await action(f, 'tick', { expectedRevision: ticked.revision });
    assert(ticked.world.resources.power <= beforePower, 'no geothermal generation while building');
    assert.equal(ticked.world.projects[0].active, n === preview.plan.buildTicks - 1);
  }
  assert(ticked.world.history.some(event => event.kind === 'commissioned'));
  const powerAtCommissioning = ticked.world.resources.power;
  ticked = await action(f, 'tick', { expectedRevision: ticked.revision });
  assert(ticked.world.resources.power > powerAtCommissioning, 'generation starts after commissioning');
  assert.deepEqual((await action(f, 'game-state')).world, ticked.world);
  assert.equal(f.writes, 3 + preview.plan.buildTicks + 1);
  assert.doesNotMatch(JSON.stringify(f.row.settings.chainReaction), /guest-no-private-access/);
});
test('Node and real Edge share identical pure geography; repeat macro placements do not fake revisions', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/_shared/chain-reaction-geography.js'), 'utf8');
  const context = { globalThis: {} };
  vm.runInNewContext(source, context);
  const edgeSync = context.globalThis.WorldConsequenceGeography.syncGeography;
  const settings = { chainReaction: engine.createWorld('same-seed'), otherSetting: { keep: true } };
  const macros = [{ type: 'city' }, { type: 'ocean' }, { type: 'forest' }, { type: 'volcano' }];
  const node = syncGeography(settings, 'same-seed', macros, engine.createWorld);
  const edge = edgeSync(settings, 'same-seed', macros, engine.createWorld);
  assert.deepEqual(clone(edge), clone(node));
  assert.deepEqual(node.otherSetting, { keep: true });
  assert.equal(node.chainReaction.land.coast, true);
  assert.equal(node.chainReaction.land.forest, true);
  assert.equal(node.chainReaction.land.volcano, true);
  assert.deepEqual(settings.chainReaction, engine.createWorld('same-seed'));
  const repeat = syncGeography(node, 'same-seed', macros, engine.createWorld);
  assert.equal(repeat.chainReaction.revision, node.chainReaction.revision);
  assert.equal(repeat.chainReaction.history.length, node.chainReaction.history.length);
  const entry = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/world-emergence/index.ts'), 'utf8');
  assert.match(entry, /syncGeography\(settings,seed,next\.entities,createConsequences\)/);
});
test('macro CAS retries without losing concurrent world fields or leaking guest identity', async () => {
  const f = fixture();
  f.injectConflict();
  await place(f, 'volcano', 16);
  assert.equal(f.writes, 1);
  assert.equal(f.row.settings.worldDNA.preserved, true);
  assert.equal(f.row.settings.chainReaction.land.volcano, true);
  assert(f.row.settings.chainReaction.history.every(event => !('actorId' in event)));
  const snapshot = clone(f.row);
  await voxel.actionMacroRead(f.admin, { worldId: 'city' });
  assert.deepEqual(f.row, snapshot);
});

test('invalid stored scenario fails closed without overwriting private world', () => {
  const original = { chainReaction: { schema: 2, revision: 7, privateValue: true } };
  assert.throws(() => syncGeography(original, 1, [{ type: 'volcano' }], engine.createWorld),
    e => e.status === 409);
  assert.equal(original.chainReaction.privateValue, true);
});

test('actual Edge macro CAS writer persists the same canonical land and revision as Node', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../supabase/functions/world-emergence/index.ts'), 'utf8');
  const first = source.indexOf('async function mutateWorld(');
  const last = source.indexOf('async function read(', first);
  assert(first >= 0 && last > first);
  const { stripTypeScriptTypes } = require('node:module');
  const js = stripTypeScriptTypes(source.slice(first, last), { mode: 'transform' });
  let row = { id: 'city', seed: 1, updated_at: '2026-09-26T00:00:00.000Z', settings: {} };
  const env = { syncGeography, createConsequences: engine.createWorld,
    structuredClone, Date,
    readWorld: async () => clone(row),
    buildState: (raw) => ({ entities: raw.entities || [], revision: raw.revision || 1,
      growthStage: raw.growthStage || 1, maxGrowthStage: 5 }) };
  vm.runInNewContext(js + '\nthis.mutateWorld=mutateWorld;', env);
  const admin = { from(table) {
    assert.equal(table, 'voxel_worlds');
    const filters = {}; let patch;
    return { update(value) { patch = value; return this; },
      eq(key, val) { filters[key] = val; return this; },
      select() { return this; },
      async maybeSingle() {
        if (filters.updated_at !== row.updated_at) return { data: null, error: null };
        row = { ...row, ...clone(patch) };
        return { data: clone(row), error: null };
      }
    };
  }};
  const result = await env.mutateWorld(admin, 'city', current => ({ ...current,
    entities: [{ type: 'volcano', x: 20, z: 0 }], revision: current.revision + 1 }));
  assert.equal(result.emergence.entities[0].type, 'volcano');
  const expected = syncGeography({}, 1, [{ type: 'volcano' }], engine.createWorld).chainReaction;
  assert.deepEqual(row.settings.chainReaction, expected);
  assert.equal(row.settings.chainReaction.land.volcano, true);
  assert.equal(row.settings.worldDNA.emergence.revision, 2);
});
