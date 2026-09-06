'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { SPECIES, getSpecies, allSpeciesIds, speciesByBiome, pickSpecies } = require('../lib/creature-factory/creature-species');
const { getLodTier, getTierConfig, shouldTick, loadPolicy, DEFAULT_POLICY } = require('../lib/creature-factory/lod');
const {
  createCreature, spawnChunk, tickCreature, damageCreature,
  resolveLoot, creatureToRow, rowToCreature, creatureId, distance
} = require('../lib/creature-factory/index');

test('all species have required fields', () => {
  const ids = allSpeciesIds();
  assert.ok(ids.length >= 1, 'at least one species defined');
  for (const id of ids) {
    const s = getSpecies(id);
    assert.equal(s.id, id, `${id} has matching id`);
    assert.ok(s.hp > 0, `${id} has positive hp`);
    assert.ok(s.damage >= 0, `${id} has non-negative damage`);
    assert.ok(s.speed > 0, `${id} has positive speed`);
    assert.ok(s.aggroRange > 0, `${id} has positive aggroRange`);
    assert.ok(s.leashRange >= s.aggroRange, `${id} leash >= aggro`);
    assert.ok(Array.isArray(s.biomes), `${id} has biomes array`);
    assert.ok(s.biomes.length > 0, `${id} has at least one biome`);
    assert.ok(Array.isArray(s.loot), `${id} has loot array`);
  }
});

test('getSpecies returns null for unknown id', () => {
  assert.equal(getSpecies('nonexistent'), null);
});

test('speciesByBiome returns correct subset', () => {
  const forest = speciesByBiome('forest');
  assert.ok(forest.length > 0, 'forest has species');
  for (const s of forest) {
    assert.ok(s.biomes.includes('forest'), `${s.id} is tagged forest`);
  }
  const tundra = speciesByBiome('tundra');
  assert.ok(tundra.some(s => s.id === 'wolf'), 'wolf is in tundra');
  assert.ok(!tundra.some(s => s.id === 'slime'), 'slime is not in tundra');
});

test('pickSpecies respects spawn weights with seeded rand', () => {
  const pool = speciesByBiome('forest');
  const counts = {};
  const rand = (() => { let v = 0.3; return () => { v = (v + 0.1) % 1; return v; }; })();
  for (let i = 0; i < 100; i++) {
    const s = pickSpecies(pool, rand);
    if (s) counts[s.id] = (counts[s.id] || 0) + 1;
  }
  assert.ok(Object.keys(counts).length > 0, 'at least one species picked');
});

test('LOD tier assignment follows distance thresholds', () => {
  assert.equal(getLodTier(0), 'full');
  assert.equal(getLodTier(15), 'full');
  assert.equal(getLodTier(30), 'full');
  assert.equal(getLodTier(31), 'high');
  assert.equal(getLodTier(55), 'high');
  assert.equal(getLodTier(60), 'high');
  assert.equal(getLodTier(61), 'medium');
  assert.equal(getLodTier(99), 'medium');
  assert.equal(getLodTier(100), 'medium');
  assert.equal(getLodTier(101), 'low');
  assert.equal(getLodTier(200), 'low');
});

test('LOD tier clamps negative and NaN distance to full (nearest)', () => {
  assert.equal(getLodTier(-10), 'full');
  assert.equal(getLodTier(NaN), 'full');
});

test('LOD tier respects custom policy', () => {
  const custom = {
    tierOrder: ['close', 'far'],
    tiers: {
      close: { maxDistance: 5, tickRate: 1, animDetail: 'full', aiEnabled: true, physicsDetail: 'full', despawn: false },
      far:   { maxDistance: 999, tickRate: 0, animDetail: 'none', aiEnabled: false, physicsDetail: 'none', despawn: true }
    }
  };
  assert.equal(getLodTier(3, custom), 'close');
  assert.equal(getLodTier(10, custom), 'far');
});

test('getTierConfig returns null for unknown tier', () => {
  assert.equal(getTierConfig('nonexistent'), null);
  assert.ok(getTierConfig('full') !== null);
});

test('shouldTick returns true when accumulated dt meets tickRate', () => {
  const tier = DEFAULT_POLICY.tiers.high;
  const interval = 1 / tier.tickRate;
  assert.ok(!shouldTick(0, 'high'), '0 dt should not tick');
  assert.ok(!shouldTick(interval * 0.5, 'high'), 'half interval should not tick');
  assert.ok(shouldTick(interval, 'high'), 'full interval should tick');
  assert.ok(shouldTick(interval * 2, 'high'), 'double interval should tick');
});

test('shouldTick returns false for low tier (tickRate 0)', () => {
  assert.ok(!shouldTick(999, 'low'), 'low tier never ticks');
});

test('loadPolicy returns defaults when no path given', () => {
  const policy = loadPolicy(null);
  assert.equal(policy.schemaVersion, '1.0.0');
  assert.ok(policy.tiers.full);
  assert.ok(policy.tiers.low);
});

test('createCreature applies species stats with HP variance', () => {
  const species = getSpecies('slime');
  const rand = () => 0.5;
  const c = createCreature(species, { x: 10, y: 0, z: 20 }, rand);
  assert.equal(c.speciesId, 'slime');
  assert.equal(c.hp, species.hp, 'hp = species hp at midpoint variance');
  assert.equal(c.maxHp, species.hp);
  assert.equal(c.position.x, 10);
  assert.equal(c.position.z, 20);
  assert.equal(c.alive, true);
  assert.equal(c.state, 'idle');
  assert.equal(c.stats.damage, species.damage);
  assert.equal(c.stats.speed, species.speed);
});

test('createCreature applies HP variance at extremes', () => {
  const species = getSpecies('wolf');
  const low = createCreature(species, { x: 0, y: 0, z: 0 }, () => 0);
  const high = createCreature(species, { x: 0, y: 0, z: 0 }, () => 1);
  assert.ok(low.hp < species.hp, 'rand 0 gives below-average hp');
  assert.ok(high.hp > species.hp, 'rand 1 gives above-average hp');
});

test('spawnChunk produces deterministic creatures', () => {
  const first = spawnChunk(3, -5, null, 'forest');
  const second = spawnChunk(3, -5, null, 'forest');
  assert.equal(first.cx, 3);
  assert.equal(first.cz, -5);
  assert.equal(first.creatures.length, second.creatures.length);
  for (let i = 0; i < first.creatures.length; i++) {
    assert.equal(first.creatures[i].id, second.creatures[i].id);
    assert.equal(first.creatures[i].speciesId, second.creatures[i].speciesId);
    assert.deepEqual(first.creatures[i].position, second.creatures[i].position);
  }
});

test('spawnChunk respects maxPerChunk limit', () => {
  const chunk = spawnChunk(0, 0, null, 'forest');
  assert.ok(chunk.creatures.length <= 6, 'no more than maxPerChunk creatures');
});

test('spawnChunk resumes from remainingById map', () => {
  const chunk = spawnChunk(1, 1, null, 'forest');
  const remaining = new Map();
  for (const c of chunk.creatures) {
    remaining.set(c.id, { ...c, hp: 1 });
  }
  const resumed = spawnChunk(1, 1, null, 'forest', remaining);
  assert.equal(resumed.creatures.length, chunk.creatures.length);
  for (const c of resumed.creatures) {
    assert.equal(c.hp, 1, 'resumed creature preserves hp from map');
  }
});

test('spawnChunk without biome defaults to plains', () => {
  const chunk = spawnChunk(10, 10);
  for (const c of chunk.creatures) {
    const s = getSpecies(c.speciesId);
    assert.ok(s.biomes.includes('plains'), `${c.speciesId} is available in plains`);
  }
});

test('distance computes Euclidean 2D', () => {
  assert.equal(distance({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
  assert.equal(distance({ x: 5, z: 5 }, { x: 5, z: 5 }), 0);
});

test('tickCreature updates LOD tier based on viewer distance', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.id = 'c:0:0:0';

  tickCreature(c, 0.016, { x: 0, y: 0, z: 0 }, null);
  assert.equal(c.lodTier, 'full');

  tickCreature(c, 0.016, { x: 50, y: 0, z: 0 }, null);
  assert.equal(c.lodTier, 'high');
});

test('tickCreature triggers aggro when viewer enters aggro range', () => {
  const c = createCreature(getSpecies('goblin'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.id = 'c:0:0:0';
  c.state = 'idle';
  c.position = { x: 0, y: 0, z: 0 };

  const viewer = { x: 5, y: 0, z: 0 };
  tickCreature(c, 1.0, viewer, null);
  assert.equal(c.state, 'chase');
  assert.equal(c.targetId, 'viewer');
});

test('tickCreature leash causes returning state', () => {
  const c = createCreature(getSpecies('wolf'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.id = 'c:0:0:0';
  c.state = 'chase';
  c.targetId = 'viewer';

  const wolfLeash = getSpecies('wolf').leashRange;
  const viewerX = wolfLeash + 5;
  tickCreature(c, 3.0, { x: viewerX, y: 0, z: 0 }, null);
  assert.equal(c.state, 'returning');
  assert.equal(c.targetId, null);
});

test('tickCreature does not process dead creatures', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.id = 'c:0:0:0';
  c.alive = false;
  const before = { ...c.position };
  tickCreature(c, 1.0, { x: 5, y: 0, z: 0 }, null);
  assert.deepEqual(c.position, before);
});

test('tickCreature despawns at low LOD tier', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.id = 'c:0:0:0';
  tickCreature(c, 1.0, { x: 200, y: 0, z: 0 }, null);
  assert.equal(c.state, 'despawned');
});

test('damageCreature reduces HP and triggers kill', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  const { killed: k1 } = damageCreature(c, 5);
  assert.equal(k1, false);
  assert.ok(c.hp < c.maxHp);

  damageCreature(c, 999);
  assert.equal(c.hp, 0);
  assert.equal(c.alive, false);
  assert.equal(c.state, 'dead');
});

test('damageCreature returns killed=true on fatal hit', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  const result = damageCreature(c, 9999);
  assert.equal(result.killed, true);
});

test('damageCreature with zero damage does not kill', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  const { killed } = damageCreature(c, 0);
  assert.equal(killed, false);
  assert.equal(c.hp, c.maxHp);
});

test('resolveLoot returns loot drops for dead creature', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.alive = false;
  const drops = resolveLoot(c, () => 0.5);
  assert.ok(drops.length > 0, 'slime drops loot');
  for (const d of drops) {
    assert.ok(d.item, 'drop has item name');
    assert.ok(d.count > 0, 'drop has positive count');
  }
});

test('resolveLoot returns empty for alive creature', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  const drops = resolveLoot(c);
  assert.equal(drops.length, 0);
});

test('resolveLoot respects chance-based loot entries', () => {
  const c = createCreature(getSpecies('goblin'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.alive = false;
  let daggerCount = 0;
  for (let i = 0; i < 200; i++) {
    const drops = resolveLoot(c, () => 0.05);
    if (drops.some(d => d.item === 'crude_dagger')) daggerCount++;
  }
  assert.ok(daggerCount > 0, 'dagger drops at least once with rand 0.05 < 0.15');
});

test('creatureToRow and rowToCreature round-trip', () => {
  const c = createCreature(getSpecies('wolf'), { x: 10, y: 0, z: -5 }, () => 0.5);
  c.id = 'c:2:3:0';
  c.hp = 30;
  c.state = 'chase';
  c.spawnTime = 1000;

  const row = creatureToRow(c);
  assert.equal(row.id, 'c:2:3:0');
  assert.equal(row.species_id, 'wolf');
  assert.equal(row.hp, 30);

  const restored = rowToCreature(row);
  assert.ok(restored, 'rowToCreature returns creature');
  assert.equal(restored.id, 'c:2:3:0');
  assert.equal(restored.speciesId, 'wolf');
  assert.equal(restored.hp, 30);
  assert.equal(restored.maxHp, getSpecies('wolf').hp);
  assert.equal(restored.stats.damage, getSpecies('wolf').damage);
});

test('rowToCreature returns null for unknown species', () => {
  const result = rowToCreature({ id: 'x', species_id: 'bogus', position: { x: 0, y: 0, z: 0 } });
  assert.equal(result, null);
});

test('creatureId formats correctly', () => {
  assert.equal(creatureId(1, -2, 3), 'c:1:-2:3');
  assert.equal(creatureId(0, 0, 0), 'c:0:0:0');
});

test('tickCreature accumulates dt and ticks at correct rate', () => {
  const c = createCreature(getSpecies('slime'), { x: 0, y: 0, z: 0 }, () => 0.5);
  c.id = 'c:0:0:0';
  c.state = 'idle';

  tickCreature(c, 0.1, { x: 2, y: 0, z: 0 }, null);
  assert.equal(c.lodAccumDt > 0, true, 'dt accumulated for full tier (1Hz)');

  tickCreature(c, 0.9, { x: 2, y: 0, z: 0 }, null);
  assert.equal(c.lodAccumDt, 0, 'dt reset after tick fires');
});

test('spawnChunk produces creatures within chunk bounds', () => {
  const cx = 5, cz = -3;
  const chunk = spawnChunk(cx, cz, null, 'plains');
  for (const c of chunk.creatures) {
    const minX = cx * 16 - 8, maxX = cx * 16 + 8;
    const minZ = cz * 16 - 8, maxZ = cz * 16 + 8;
    assert.ok(c.position.x >= minX && c.position.x < maxX, `${c.id} x in bounds`);
    assert.ok(c.position.z >= minZ && c.position.z < maxZ, `${c.id} z in bounds`);
  }
});
