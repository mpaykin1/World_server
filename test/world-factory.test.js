'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createWorldDNA, settingsFromDNA, publicWorld } = require('../lib/world-factory');
const factoryApi = require('../lib/api-handlers/world-factory')._private;

const root = path.resolve(__dirname, '..');
const loreBible = JSON.parse(fs.readFileSync(path.join(root, 'data', 'world-lore-v2.json'), 'utf8').replace(/^\uFEFF/, ''));
const requestId = '123e4567-e89b-42d3-a456-426614174000';

function fakeAdmin() {
  const rows = new Map();
  return {
    rows,
    from(table) {
      assert.equal(table, 'voxel_worlds');
      let id = null;
      let inserted = null;
      return {
        select() { return this; },
        eq(_key, value) { id = value; return this; },
        async maybeSingle() { return { data: rows.get(id) || null, error: null }; },
        insert(payload) { inserted = { ...payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }; rows.set(payload.id, inserted); return this; },
        async single() { return { data: inserted, error: null }; },
        order() { return this; },
        async limit(n) { return { data: [...rows.values()].slice(0, n), error: null }; }
      };
    }
  };
}

test('World Factory creates deterministic playable World DNA with lore and quality floor', () => {
  const a = createWorldDNA({ idea: 'лесной мир с древним замком и рекой', requestId, loreBible });
  const b = createWorldDNA({ idea: 'лесной мир с древним замком и рекой', requestId, loreBible });
  assert.equal(a.id, b.id);
  assert.equal(a.seed, b.seed);
  assert.equal(a.theme, 'forest');
  assert.equal(a.visualProfile.qualityFloor, 85);
  assert.equal(a.visualProfile.pbr, true);
  assert.equal(a.visualProfile.microdetail, true);
  assert.equal(a.lore.connections.length, 1);
  assert.ok(loreBible.worlds[a.lore.connections[0].targetId]);
});

test('World Factory settings are directly playable by the existing voxel runtime', () => {
  const dna = createWorldDNA({ idea: 'острова и маяк', requestId, loreBible });
  const row = { id: dna.id, seed: dna.seed, settings: settingsFromDNA(dna) };
  const world = publicWorld(row);
  assert.equal(world.id, dna.id);
  assert.match(world.playUrl, /^\/apps\/voxel-world\/\?world=world-/);
  assert.equal(world.lore.generated, true);
  assert.equal(world.worldDNA.generator.kind, 'procedural-voxel');
});

test('create is idempotent: retry returns the same persisted world instead of duplicating it', async () => {
  const admin = fakeAdmin();
  const body = { idea: 'горы, снег и крепость', requestId };
  const first = await factoryApi.createWorld(admin, body);
  const second = await factoryApi.createWorld(admin, body);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.idempotent, true);
  assert.equal(first.world.id, second.world.id);
  assert.equal(admin.rows.size, 1);
});

test('user-facing create flow routes every generated world through its own id and realtime channel', () => {
  const client = fs.readFileSync(path.join(root, 'apps', 'voxel-world', 'client.js'), 'utf8');
  const shell = fs.readFileSync(path.join(root, 'shared', 'golden-ui-shell.js'), 'utf8');
  const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');
  assert.match(client, /const ACTIVE_WORLD_ID/);
  assert.doesNotMatch(client, /worldId:'main'/);
  assert.match(client, /channel\('voxel:'\+ACTIVE_WORLD_ID/);
  assert.match(shell, /id="goldenCreateWorld"/);
  assert.match(shell, /\/api\/world-factory/);
  assert.match(server, /\['\/api\/world-factory', require\('\.\/lib\/api-handlers\/world-factory'\)\]/);
});
