'use strict';

const { getSpecies, speciesByBiome, pickSpecies } = require('./creature-species');
const lodApi = require('./lod');
const { getLodTier, getTierConfig, shouldTick, loadPolicy } = lodApi;
const assetRuntime = require('./asset-runtime');

const CREATURE_CHUNK_SIZE = 16;

function seeded(seed) {
  seed = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return () => {
    h += 0x6D2B79F5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function creatureId(cx, cz, index) {
  return `c:${cx}:${cz}:${index}`;
}

function createCreature(species, position, rand) {
  const hpVariance = 0.1;
  const hpRoll = 1 + (rand() - 0.5) * 2 * hpVariance;
  const maxHp = Math.round(species.hp * hpRoll);
  return {
    id: null,
    speciesId: species.id,
    position: { x: position.x, y: position.y || 0, z: position.z },
    velocity: { x: 0, y: 0, z: 0 },
    hp: maxHp,
    maxHp,
    state: 'idle',
    targetId: null,
    lodTier: 'full',
    lodAccumDt: 0,
    lastTickTime: 0,
    spawnTime: 0,
    deathTime: 0,
    rotationY: 0,
    stats: {
      damage: species.damage,
      speed: species.speed,
      aggroRange: species.aggroRange,
      leashRange: species.leashRange,
      xp: species.xp
    },
    loot: species.loot,
    alive: true,
    generated: false
  };
}

function spawnChunk(cx, cz, policyOverride, biome, remainingById) {
  const policy = loadPolicy(policyOverride);
  const spawnPolicy = policy.spawnPolicy || {};
  const maxPerChunk = spawnPolicy.maxPerChunk || 6;
  const rand = seeded(`creatures:${cx}:${cz}`);
  const creatures = [];
  const speciesPool = biome ? speciesByBiome(biome) : speciesByBiome('plains');

  for (let i = 0; i < maxPerChunk; i++) {
    const id = creatureId(cx, cz, i);
    if (remainingById && remainingById.has(id)) {
      const existing = remainingById.get(id);
      if (existing) creatures.push(existing);
      continue;
    }

    const species = pickSpecies(speciesPool, rand);
    if (!species) continue;

    const localX = rand() * CREATURE_CHUNK_SIZE - CREATURE_CHUNK_SIZE / 2;
    const localZ = rand() * CREATURE_CHUNK_SIZE - CREATURE_CHUNK_SIZE / 2;
    const position = {
      x: cx * CREATURE_CHUNK_SIZE + localX,
      y: 0,
      z: cz * CREATURE_CHUNK_SIZE + localZ
    };

    const creature = createCreature(species, position, rand);
    creature.id = id;
    creatures.push(creature);
  }

  return { cx, cz, creatures };
}

function distance(a, b) {
  const dx = a.x - b.x;
  const dz = a.z - b.z;
  return Math.sqrt(dx * dx + dz * dz);
}

function tickCreature(creature, dt, viewerPosition, policyOverride) {
  if (!creature.alive) return creature;

  const policy = loadPolicy(policyOverride);
  const viewerDist = viewerPosition ? distance(creature.position, viewerPosition) : Infinity;
  const newTier = getLodTier(viewerDist, policy);

  creature.lodTier = newTier;
  const tierConfig = getTierConfig(newTier, policy);
  if (!tierConfig) return creature;

  if (tierConfig.despawn) {
    creature.state = 'despawned';
    return creature;
  }

  creature.lodAccumDt += dt;
  if (!shouldTick(creature.lodAccumDt, newTier, policy)) return creature;

  const tickDt = creature.lodAccumDt;
  creature.lodAccumDt = 0;

  if (tierConfig.aiEnabled && creature.state === 'idle') {
    if (viewerDist <= creature.stats.aggroRange) {
      creature.state = 'chase';
      creature.targetId = 'viewer';
    }
  }

  if (creature.state === 'chase') {
    const leashDist = creature.stats.leashRange;
    if (viewerDist > leashDist) {
      creature.state = 'returning';
      creature.targetId = null;
    } else if (tierConfig.physicsDetail !== 'none') {
      const moveSpeed = creature.stats.speed * tickDt;
      if (viewerDist > 1.5) {
        const dx = viewerPosition.x - creature.position.x;
        const dz = viewerPosition.z - creature.position.z;
        const len = Math.sqrt(dx * dx + dz * dz) || 1;
        creature.position.x += (dx / len) * moveSpeed;
        creature.position.z += (dz / len) * moveSpeed;
        creature.rotationY = Math.atan2(dx, dz);
      }
    }
  }

  if (creature.state === 'returning') {
    const tierSpeed = tierConfig.physicsDetail === 'none' ? 0 : creature.stats.speed * 0.5 * tickDt;
    if (viewerDist <= creature.stats.aggroRange * 0.5) {
      creature.state = 'idle';
    } else if (tierSpeed > 0 && viewerPosition) {
      const dx = viewerPosition.x - creature.position.x;
      const dz = viewerPosition.z - creature.position.z;
      const len = Math.sqrt(dx * dx + dz * dz) || 1;
      creature.position.x -= (dx / len) * tierSpeed;
      creature.position.z -= (dz / len) * tierSpeed;
    }
  }

  return creature;
}

function damageCreature(creature, amount) {
  if (!creature.alive) return { creature, killed: false };
  const dmg = Math.max(0, Number(amount) || 0);
  creature.hp = Math.max(0, creature.hp - dmg);
  if (creature.hp <= 0) {
    creature.alive = false;
    creature.state = 'dead';
    creature.deathTime = Date.now();
    return { creature, killed: true };
  }
  if (creature.state === 'idle') {
    creature.state = 'chase';
    creature.targetId = null;
  }
  return { creature, killed: false };
}

function resolveLoot(creature, rand) {
  if (creature.alive) return [];
  const drops = [];
  const roll = rand || Math.random;
  for (const entry of creature.loot) {
    if (entry.chance !== undefined) {
      if (roll() >= entry.chance) continue;
      drops.push({ item: entry.item, count: 1 });
    } else {
      const count = entry.min + Math.floor(roll() * (entry.max - entry.min + 1));
      if (count > 0) drops.push({ item: entry.item, count });
    }
  }
  return drops;
}

function creatureToRow(creature) {
  return {
    id: creature.id,
    species_id: creature.speciesId,
    position: creature.position,
    hp: creature.hp,
    max_hp: creature.maxHp,
    state: creature.state,
    alive: creature.alive,
    spawn_time: creature.spawnTime,
    death_time: creature.deathTime
  };
}

function rowToCreature(row) {
  const species = getSpecies(row.species_id);
  if (!species) return null;
  return {
    id: row.id,
    speciesId: row.species_id,
    position: row.position || { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    hp: Number(row.hp) || 0,
    maxHp: Number(row.max_hp) || species.hp,
    state: row.state || 'idle',
    targetId: null,
    lodTier: 'full',
    lodAccumDt: 0,
    lastTickTime: 0,
    spawnTime: row.spawn_time || 0,
    deathTime: row.death_time || 0,
    rotationY: 0,
    stats: {
      damage: species.damage,
      speed: species.speed,
      aggroRange: species.aggroRange,
      leashRange: species.leashRange,
      xp: species.xp
    },
    loot: species.loot,
    alive: row.alive !== false,
    generated: true
  };
}

module.exports = {
  CREATURE_CHUNK_SIZE,
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
  ...lodApi,
  ...assetRuntime
};
