'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  seeded,
  creatureId,
  createCreature,
  spawnChunk,
  tickCreature,
  damageCreature,
  resolveLoot,
  creatureToRow,
  rowToCreature,
  distance,
  getLodTier,
  getTierConfig,
  shouldTick,
  loadPolicy,
  DEFAULT_POLICY,
  computeUpdateInterval,
  validateFormat,
  buildRecipe,
  recipeHash,
  instancingKey,
  AnimationScheduler,
  LodHysteresis,
  CATEGORIES,
} = require('../lib/creature-factory');

const LOD_POLICY_PATH = path.join(__dirname, '..', 'data', 'creature-lod-policy.json');

// ---------------------------------------------------------------------------
// 1. Format imports: zero-signal-procedural-asset-v1 and
//    zero-signal-godot-procedural-asset-v1 are accepted
// ---------------------------------------------------------------------------
test('accepts zero-signal-procedural-asset-v1 format', () => {
  const asset = {
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'forest_wolf', seed: 'abc' },
  };
  const result = validateFormat(asset);
  assert.equal(result.ok, true);
});

test('accepts zero-signal-godot-procedural-asset-v1 format', () => {
  const asset = {
    format: 'zero-signal-godot-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'forest_wolf', seed: 'abc' },
  };
  const result = validateFormat(asset);
  assert.equal(result.ok, true);
});

test('rejects unknown format', () => {
  const asset = { format: 'unknown-format-v2', category: 'beast', params: {} };
  const result = validateFormat(asset);
  assert.equal(result.ok, false);
  assert.match(result.error, /format/i);
});

// ---------------------------------------------------------------------------
// 2. All 13 categories are accepted
// ---------------------------------------------------------------------------
test('all 13 creature categories are accepted', () => {
  assert.ok(Array.isArray(CATEGORIES), 'CATEGORIES must be an array');
  assert.equal(CATEGORIES.length, 13, 'must have exactly 13 categories');

  for (const cat of CATEGORIES) {
    const asset = {
      format: 'zero-signal-procedural-asset-v1',
      category: cat,
      params: { seed: 'test' },
    };
    const result = validateFormat(asset);
    assert.equal(result.ok, true, `category "${cat}" should be accepted`);
  }
});

// ---------------------------------------------------------------------------
// 3. Malformed format/category rejected
// ---------------------------------------------------------------------------
test('missing format is rejected', () => {
  const asset = { category: 'beast', params: {} };
  const result = validateFormat(asset);
  assert.equal(result.ok, false);
});

test('missing category is rejected', () => {
  const asset = { format: 'zero-signal-procedural-asset-v1', params: {} };
  const result = validateFormat(asset);
  assert.equal(result.ok, false);
  assert.match(result.error, /category/i);
});

test('unknown category is rejected', () => {
  const asset = {
    format: 'zero-signal-procedural-asset-v1',
    category: 'nonexistent_category_xyz',
    params: {},
  };
  const result = validateFormat(asset);
  assert.equal(result.ok, false);
  assert.match(result.error, /category/i);
});

test('null asset is rejected', () => {
  const result = validateFormat(null);
  assert.equal(result.ok, false);
});

// ---------------------------------------------------------------------------
// 4. Same input gives same recipe hash / seed
// ---------------------------------------------------------------------------
test('identical inputs produce identical recipe hash and seed', () => {
  const asset = {
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'wolf', seed: 'farm1', hp: 45 },
  };
  const r1 = buildRecipe(asset);
  const r2 = buildRecipe(asset);
  assert.equal(r1.hash, r2.hash, 'hash must be identical');
  assert.equal(r1.seed, r2.seed, 'seed must be identical');
});

test('different inputs produce different hashes', () => {
  const a = buildRecipe({
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'wolf', seed: 'farm1' },
  });
  const b = buildRecipe({
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'wolf', seed: 'farm2' },
  });
  assert.notEqual(a.hash, b.hash);
});

// ---------------------------------------------------------------------------
// 5. Source object payload is NOT copied into canonical runtime recipe
//    except bounded hash/metadata
// ---------------------------------------------------------------------------
test('source payload is not copied into canonical recipe beyond hash+metadata', () => {
  const sourcePayload = {
    hugeArray: new Array(1000).fill('x'),
    nested: { deep: { value: 'secret' } },
    extraField: 42,
  };
  const asset = {
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { seed: 'test' },
    source: sourcePayload,
  };
  const recipe = buildRecipe(asset);

  assert.ok(recipe.hash, 'recipe must have hash');
  assert.ok(typeof recipe.seed === 'string' || typeof recipe.seed === 'number', 'recipe must have seed');
  assert.ok(recipe.metadata, 'recipe must have metadata');

  const recipeStr = JSON.stringify(recipe);
  assert.ok(!recipeStr.includes('hugeArray'), 'hugeArray must not leak into recipe');
  assert.ok(!recipeStr.includes('secret'), 'nested secret must not leak into recipe');
  assert.ok(!recipeStr.includes('extraField'), 'extraField must not leak into recipe');

  assert.equal(typeof recipe.metadata.sourceHash, 'string');
  assert.ok(recipe.metadata.sourceHash.length > 0, 'metadata must carry bounded sourceHash');
});

// ---------------------------------------------------------------------------
// 6. LOD quality is monotonic with distance / visibility
// ---------------------------------------------------------------------------
test('LOD tier degrades monotonically as distance increases', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  const tierNames = policy.tierOrder || Object.keys(policy.tiers);
  const tierRank = {};
  tierNames.forEach((name, i) => { tierRank[name] = i; });

  const distances = [0, 1, 5, 10, 20, 30, 50, 60, 80, 100, 130, 160, 200, 300];
  let lastRank = -1;
  for (const d of distances) {
    const tier = getLodTier(d, policy);
    const rank = tierRank[tier];
    assert.ok(rank >= lastRank, `tier at distance ${d} ("${tier}") should not improve over previous rank`);
    lastRank = rank;
  }
});

test('closer distance gives better or equal tier than farther', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  const t0 = getLodTier(5, policy);
  const t30 = getLodTier(30, policy);
  const t100 = getLodTier(100, policy);

  const order = policy.tierOrder || Object.keys(policy.tiers);
  const rank = (t) => order.indexOf(t);
  assert.ok(rank(t0) <= rank(t30), 'tier at 5m should be better/equal than at 30m');
  assert.ok(rank(t30) <= rank(t100), 'tier at 30m should be better/equal than at 100m');
});

test('animDetail quality decreases with distance', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  const detailRank = { full: 0, reduced: 1, minimal: 2, none: 3 };
  const distances = [5, 50, 80, 120];
  let lastRank = -1;
  for (const d of distances) {
    const tier = getLodTier(d, policy);
    const cfg = getTierConfig(tier, policy);
    const r = detailRank[cfg.animDetail] ?? 99;
    assert.ok(r >= lastRank, `animDetail at ${d}m should not improve`);
    lastRank = r;
  }
});

// ---------------------------------------------------------------------------
// 7. Invisible creatures sleep (tickRate=0 → shouldTick always false)
// ---------------------------------------------------------------------------
test('low-tier creatures (despawn) do not tick', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  const lowCfg = getTierConfig('low', policy);
  assert.equal(lowCfg.tickRate, 0, 'low tier tickRate must be 0');
  assert.equal(shouldTick(10, 'low', policy), false, 'shouldTick must be false at tickRate 0');
});

test('invisible-tier tick never fires regardless of accumulated time', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  for (const dt of [0, 1, 10, 1000]) {
    assert.equal(shouldTick(dt, 'low', policy), false);
  }
});

test('full-tier ticks when enough dt accumulates', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  assert.equal(shouldTick(0.01, 'full', policy), false);
  assert.equal(shouldTick(1.5, 'full', policy), true, 'full tier should tick after >= 1s');
});

// ---------------------------------------------------------------------------
// 8. Animation scheduler spreads updates across IDs
// ---------------------------------------------------------------------------
test('AnimationScheduler spreads updates across frames for different IDs', () => {
  const scheduler = new AnimationScheduler({ maxPerFrame: 3 });
  const ids = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

  const first = scheduler.schedule(ids);
  const second = scheduler.schedule(ids);

  const setA = new Set(first);
  const setB = new Set(second);

  assert.ok(first.length <= 3, 'first batch ≤ maxPerFrame');
  assert.ok(second.length <= 3, 'second batch ≤ maxPerFrame');

  const overlap = first.filter((id) => setB.has(id));
  assert.equal(overlap.length, 0, 'batches must not overlap');
  assert.equal(first.length + second.length, ids.length, 'all IDs covered in two passes');
});

test('AnimationScheduler handles more IDs than maxPerFrame gracefully', () => {
  const scheduler = new AnimationScheduler({ maxPerFrame: 2 });
  const ids = ['x1', 'x2', 'x3', 'x4', 'x5'];

  const all = [];
  for (let i = 0; i < 10; i++) {
    all.push(...scheduler.schedule(ids));
  }
  const unique = new Set(all);
  assert.equal(unique.size, 5, 'all 5 IDs should appear across multiple rounds');
});

test('AnimationScheduler returns empty for empty IDs', () => {
  const scheduler = new AnimationScheduler({ maxPerFrame: 5 });
  const result = scheduler.schedule([]);
  assert.deepEqual(result, []);
});

// ---------------------------------------------------------------------------
// 9. Instancing key stable for identical recipe+lod
// ---------------------------------------------------------------------------
test('instancingKey is stable for identical recipe+lod', () => {
  const recipe = buildRecipe({
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'skeleton', seed: 'crypt1' },
  });
  const ik1 = instancingKey(recipe, 'full');
  const ik2 = instancingKey(recipe, 'full');
  assert.equal(ik1, ik2, 'same recipe+lod must produce same instancing key');
});

test('instancingKey differs for different LOD tier', () => {
  const recipe = buildRecipe({
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'skeleton', seed: 'crypt1' },
  });
  const ikFull = instancingKey(recipe, 'full');
  const ikLow = instancingKey(recipe, 'low');
  assert.notEqual(ikFull, ikLow, 'different LOD must produce different key');
});

test('instancingKey differs for different recipes', () => {
  const r1 = buildRecipe({
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'wolf', seed: 'a' },
  });
  const r2 = buildRecipe({
    format: 'zero-signal-procedural-asset-v1',
    category: 'beast',
    params: { variant: 'wolf', seed: 'b' },
  });
  assert.notEqual(instancingKey(r1, 'full'), instancingKey(r2, 'full'));
});

// ---------------------------------------------------------------------------
// 10. Hysteresis avoids oscillating every frame
// ---------------------------------------------------------------------------
test('LodHysteresis does not flip on small oscillation', () => {
  const hyst = new LodHysteresis({ hysteresisFrames: 3 });

  hyst.record('wolf1', 'full');
  assert.equal(hyst.current('wolf1'), 'full');

  hyst.record('wolf1', 'high');
  assert.equal(hyst.current('wolf1'), 'full', 'should still be full during grace');

  hyst.record('wolf1', 'high');
  assert.equal(hyst.current('wolf1'), 'full', 'still within grace period');

  hyst.record('wolf1', 'full');
  assert.equal(hyst.current('wolf1'), 'full', 'returned to original, stays full');
});

test('LodHysteresis flips after enough consecutive frames', () => {
  const hyst = new LodHysteresis({ hysteresisFrames: 2 });

  hyst.record('goblin1', 'full');
  hyst.record('goblin1', 'high');
  hyst.record('goblin1', 'high');
  assert.equal(hyst.current('goblin1'), 'high', 'after 2+ frames of high, should flip');
});

test('LodHysteresis handles unknown IDs', () => {
  const hyst = new LodHysteresis({ hysteresisFrames: 3 });
  assert.equal(hyst.current('unknown'), undefined);
});

// ---------------------------------------------------------------------------
// Core creature factory existing functionality (regression)
// ---------------------------------------------------------------------------
test('seeded PRNG is deterministic', () => {
  const r1 = seeded('hello');
  const r2 = seeded('hello');
  const vals1 = Array.from({ length: 10 }, () => r1());
  const vals2 = Array.from({ length: 10 }, () => r2());
  assert.deepEqual(vals1, vals2);
});

test('creatureId format is predictable', () => {
  assert.equal(creatureId(0, 0, 0), 'c:0:0:0');
  assert.equal(creatureId(3, -1, 5), 'c:3:-1:5');
});

test('spawnChunk produces correct number of creatures', () => {
  const chunk = spawnChunk(0, 0, null, 'plains');
  assert.ok(chunk.creatures.length > 0);
  assert.ok(chunk.creatures.length <= 6, 'should not exceed maxPerChunk');
  assert.equal(chunk.cx, 0);
  assert.equal(chunk.cz, 0);
});

test('createCreature has required fields', () => {
  const species = { id: 'test', hp: 100, damage: 10, speed: 2, aggroRange: 10, leashRange: 30, xp: 20, loot: [] };
  const c = createCreature(species, { x: 1, y: 2, z: 3 }, seeded('test'));
  assert.equal(c.hp, c.maxHp);
  assert.equal(c.state, 'idle');
  assert.equal(c.alive, true);
  assert.equal(c.position.x, 1);
  assert.equal(c.position.z, 3);
});

test('damageCreature kills when hp drops to 0', () => {
  const species = { id: 'weak', hp: 5, damage: 1, speed: 1, aggroRange: 5, leashRange: 15, xp: 5, loot: [] };
  const c = createCreature(species, { x: 0, y: 0, z: 0 }, seeded('x'));
  const { creature, killed } = damageCreature(c, 100);
  assert.equal(killed, true);
  assert.equal(creature.alive, false);
  assert.equal(creature.hp, 0);
});

test('resolveLoot drops nothing for alive creature', () => {
  const species = { id: 'x', hp: 10, damage: 1, speed: 1, aggroRange: 5, leashRange: 15, xp: 1, loot: [{ item: 'gem', min: 1, max: 1 }] };
  const c = createCreature(species, { x: 0, y: 0, z: 0 }, seeded('x'));
  const drops = resolveLoot(c);
  assert.equal(drops.length, 0);
});

test('distance computes correct 2D distance', () => {
  assert.equal(distance({ x: 0, z: 0 }, { x: 3, z: 4 }), 5);
  assert.equal(distance({ x: 0, z: 0 }, { x: 0, z: 0 }), 0);
});

test('computeUpdateInterval returns Infinity for zero tickRate', () => {
  assert.equal(computeUpdateInterval('low', loadPolicy(LOD_POLICY_PATH)), Infinity);
});

test('computeUpdateInterval returns finite value for full tier', () => {
  const policy = loadPolicy(LOD_POLICY_PATH);
  const interval = computeUpdateInterval('full', policy);
  assert.ok(interval > 0 && interval < Infinity);
});
