'use strict';

const core = require('../shared/world-procedural-core');

const GRAMMAR_VERSION = '3.0.0';
const MATERIAL = Object.freeze({ stone: 5, dark: 2, accent: 13, wood: 9, green: 12 });

function clamp(v, a, b) { return Math.max(a, Math.min(b, Number(v))); }
function key3(x, y, z) { return `${x},${y},${z}`; }
function regionKey(x, z) { return `${Math.trunc(x)},${Math.trunc(z)}`; }

function grammarKind(recipe) {
  const a = String(recipe?.architecture?.kind || '').toLowerCase();
  const t = String(recipe?.terrain?.kind || '').toLowerCase();
  const theme = String(recipe?.style?.materialTheme || '').toLowerCase();
  if (/goth|гот|cathedral|собор|steampunk|стим/.test(`${a} ${theme}`)) return 'gothic-city';
  if (/ruin|руин|ancient|древ/.test(`${a} ${theme}`)) return 'ruins';
  if (/forest|лес|organic|природ/.test(`${a} ${t}`)) return 'forest';
  if (/city|город|urban|архит/.test(a)) return 'city';
  return a === 'none' ? 'landscape' : 'mixed';
}

function chooseWeighted(random, table) {
  const total = table.reduce((s, item) => s + item[1], 0);
  let roll = random() * total;
  for (const [name, weight] of table) {
    roll -= weight;
    if (roll <= 0) return name;
  }
  return table[table.length - 1][0];
}

function typeWeights(kind) {
  if (kind === 'gothic-city') return [['tower', 4], ['arch', 3], ['wall', 3], ['spire', 2], ['bridge', 1]];
  if (kind === 'ruins') return [['wall', 4], ['arch', 3], ['tower', 1], ['rock', 2]];
  if (kind === 'forest') return [['tree', 6], ['rock', 3], ['arch', 0.5]];
  if (kind === 'city') return [['tower', 3], ['wall', 4], ['arch', 2], ['bridge', 1]];
  if (kind === 'mixed') return [['tower', 2], ['wall', 2], ['tree', 2], ['rock', 2], ['arch', 1]];
  return [['tree', 3], ['rock', 5]];
}

function compileRegionPlan(recipeInput, regionX = 0, regionZ = 0, options = {}) {
  const recipe = core.normalizeRecipe(recipeInput);
  const chunkSize = Math.max(4, Math.min(64, Math.trunc(Number(options.chunkSize) || 16)));
  const regionChunks = Math.max(1, Math.min(16, Math.trunc(Number(options.regionChunks) || 4)));
  const regionWorldSize = chunkSize * regionChunks;
  const originX = Math.trunc(regionX) * regionWorldSize;
  const originZ = Math.trunc(regionZ) * regionWorldSize;
  const kind = grammarKind(recipe);
  const density = clamp(recipe.architecture.density + recipe.style.detail * 0.12, 0.02, 1);
  const maxPlacements = Math.max(1, Math.min(512, Math.trunc(Number(options.maxPlacements) || 96)));
  const desired = Math.min(maxPlacements, Math.max(1, Math.round(regionChunks * regionChunks * (1.5 + density * 5))));
  const seed = (recipe.seed ^ core.hashCoords2D(regionX, regionZ, 0x35d14a7b) ^ recipe.revision) >>> 0;
  const random = core.mulberry32(seed);
  const placements = [];
  const occupied = new Set();
  const weights = typeWeights(kind);

  for (let i = 0; i < desired * 3 && placements.length < desired; i += 1) {
    const x = originX + Math.floor(random() * regionWorldSize);
    const z = originZ + Math.floor(random() * regionWorldSize);
    const coarse = `${Math.floor((x - originX) / 4)},${Math.floor((z - originZ) / 4)}`;
    if (occupied.has(coarse) && random() < 0.72) continue;
    occupied.add(coarse);
    const type = chooseWeighted(random, weights);
    const groundY = core.sampleTerrainHeight(recipe, x, z);
    const vertical = clamp(recipe.architecture.verticality, 0, 1);
    const ruin = clamp(recipe.architecture.ruin, 0, 1);
    const baseHeight = 3 + Math.round(vertical * 18);
    const placement = {
      id: `${regionX}:${regionZ}:${placements.length}`,
      type,
      x,
      y: groundY + 1,
      z,
      height: Math.max(2, Math.round(baseHeight * (0.55 + random() * 0.9))),
      width: Math.max(1, Math.round(1 + random() * (1 + recipe.architecture.repetition * 4))),
      depth: Math.max(1, Math.round(1 + random() * 3)),
      ruin: +clamp(ruin * (0.65 + random() * 0.7), 0, 0.95).toFixed(4),
      material: type === 'tree' ? MATERIAL.wood : type === 'rock' ? MATERIAL.dark : MATERIAL.stone,
      accent: MATERIAL.accent,
      seed: Math.floor(random() * 0xffffffff) >>> 0
    };
    if (type === 'tree') {
      placement.height = Math.max(3, Math.round(4 + recipe.style.detail * 7 + random() * 4));
      placement.width = 1;
      placement.depth = 1;
    }
    if (type === 'bridge') placement.width = Math.max(4, Math.round(5 + random() * 8));
    placements.push(placement);
  }

  placements.sort((a, b) => a.x - b.x || a.z - b.z || a.type.localeCompare(b.type));
  return {
    grammarVersion: GRAMMAR_VERSION,
    recipeRevision: recipe.revision,
    kind,
    region: { x: Math.trunc(regionX), z: Math.trunc(regionZ), chunkSize, regionChunks, worldSize: regionWorldSize },
    seed,
    placements
  };
}

function addVoxel(out, occupied, x, y, z, material, bounds, maxVoxels) {
  x = Math.trunc(x); y = Math.trunc(y); z = Math.trunc(z);
  if (x < bounds.minX || x > bounds.maxX || z < bounds.minZ || z > bounds.maxZ || y < -64 || y > 320) return false;
  if (out.length >= maxVoxels) return false;
  const key = key3(x, y, z);
  if (occupied.has(key)) return true;
  occupied.add(key);
  out.push([x, y, z, material]);
  return true;
}

function emitTower(p, out, occupied, bounds, maxVoxels) {
  const random = core.mulberry32(p.seed);
  const radius = Math.max(1, p.width);
  for (let dy = 0; dy < p.height; dy += 1) {
    const taper = dy > p.height * 0.72 ? Math.max(1, radius - 1) : radius;
    for (let dx = -taper; dx <= taper; dx += 1) for (let dz = -taper; dz <= taper; dz += 1) {
      const shell = Math.abs(dx) === taper || Math.abs(dz) === taper || dy === p.height - 1;
      if (!shell) continue;
      if (random() < p.ruin * 0.13) continue;
      addVoxel(out, occupied, p.x + dx, p.y + dy, p.z + dz, dy === p.height - 1 ? p.accent : p.material, bounds, maxVoxels);
    }
  }
}

function emitWall(p, out, occupied, bounds, maxVoxels) {
  const horizontalX = (p.seed & 1) === 0;
  const length = Math.max(4, p.width * 4);
  const height = Math.max(2, Math.round(p.height * 0.45));
  const random = core.mulberry32(p.seed ^ 0xa53a9e1d);
  for (let i = -Math.floor(length / 2); i <= Math.floor(length / 2); i += 1) for (let dy = 0; dy < height; dy += 1) {
    if (random() < p.ruin * 0.09) continue;
    addVoxel(out, occupied, p.x + (horizontalX ? i : 0), p.y + dy, p.z + (horizontalX ? 0 : i), p.material, bounds, maxVoxels);
  }
}

function emitArch(p, out, occupied, bounds, maxVoxels) {
  const half = Math.max(2, p.width + 1);
  const height = Math.max(4, Math.round(p.height * 0.55));
  for (let dx = -half; dx <= half; dx += 1) {
    const curve = Math.round(Math.sqrt(Math.max(0, 1 - (dx * dx) / (half * half))) * height);
    for (let dy = 0; dy < height; dy += 1) {
      const pillar = Math.abs(dx) >= half - 1 && dy < Math.floor(height * 0.65);
      const archBand = dy >= curve - 1 && dy <= curve + 1;
      if (pillar || archBand) addVoxel(out, occupied, p.x + dx, p.y + dy, p.z, archBand ? p.accent : p.material, bounds, maxVoxels);
    }
  }
}

function emitSpire(p, out, occupied, bounds, maxVoxels) {
  const height = Math.max(6, p.height + Math.round(p.height * 0.5));
  for (let dy = 0; dy < height; dy += 1) {
    const radius = Math.max(0, Math.floor((1 - dy / height) * Math.max(1, p.width)));
    for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
      addVoxel(out, occupied, p.x + dx, p.y + dy, p.z + dz, dy > height * 0.72 ? p.accent : p.material, bounds, maxVoxels);
    }
  }
}

function emitTree(p, out, occupied, bounds, maxVoxels) {
  const trunk = Math.max(2, p.height - 2);
  for (let dy = 0; dy < trunk; dy += 1) addVoxel(out, occupied, p.x, p.y + dy, p.z, MATERIAL.wood, bounds, maxVoxels);
  for (let dy = trunk - 2; dy <= p.height; dy += 1) {
    const radius = Math.max(1, Math.round(2 - Math.abs(dy - (trunk - 0.5)) * 0.3));
    for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) {
      if (Math.abs(dx) + Math.abs(dz) > radius + 1) continue;
      addVoxel(out, occupied, p.x + dx, p.y + dy, p.z + dz, MATERIAL.green, bounds, maxVoxels);
    }
  }
}

function emitRock(p, out, occupied, bounds, maxVoxels) {
  const radius = Math.max(1, Math.min(4, p.width + 1));
  for (let dx = -radius; dx <= radius; dx += 1) for (let dz = -radius; dz <= radius; dz += 1) for (let dy = 0; dy <= radius; dy += 1) {
    if (dx * dx + dz * dz + dy * dy > radius * radius * 1.25) continue;
    addVoxel(out, occupied, p.x + dx, p.y + dy, p.z + dz, p.material, bounds, maxVoxels);
  }
}

function emitBridge(p, out, occupied, bounds, maxVoxels) {
  const horizontalX = (p.seed & 1) === 0;
  const half = Math.max(2, Math.floor(p.width / 2));
  for (let i = -half; i <= half; i += 1) {
    const sag = Math.round((Math.abs(i) / Math.max(1, half)) * 2);
    const x = p.x + (horizontalX ? i : 0);
    const z = p.z + (horizontalX ? 0 : i);
    addVoxel(out, occupied, x, p.y + 2 - sag, z, p.material, bounds, maxVoxels);
    addVoxel(out, occupied, x, p.y + 1 - sag, z, p.material, bounds, maxVoxels);
  }
}

function applyRegionPlanToChunk(chunk, plan, options = {}) {
  if (!chunk || !Array.isArray(chunk.voxels) || !chunk.chunk) throw new TypeError('voxel chunk required');
  const out = chunk.voxels.map((v) => v.slice());
  const occupied = new Set(out.map((v) => key3(v[0], v[1], v[2])));
  const size = Number(chunk.chunk.size) || 16;
  const minX = chunk.chunk.x * size;
  const minZ = chunk.chunk.z * size;
  const bounds = { minX, maxX: minX + size - 1, minZ, maxZ: minZ + size - 1 };
  const maxVoxels = Math.max(out.length, Math.min(120000, Math.trunc(Number(options.maxVoxels) || chunk.stats?.maxVoxels || 24000)));
  const before = out.length;
  const emitters = { tower: emitTower, wall: emitWall, arch: emitArch, spire: emitSpire, tree: emitTree, rock: emitRock, bridge: emitBridge };
  let considered = 0;
  for (const p of plan?.placements || []) {
    if (p.x < bounds.minX - 12 || p.x > bounds.maxX + 12 || p.z < bounds.minZ - 12 || p.z > bounds.maxZ + 12) continue;
    considered += 1;
    (emitters[p.type] || emitRock)(p, out, occupied, bounds, maxVoxels);
    if (out.length >= maxVoxels) break;
  }
  return {
    ...chunk,
    voxels: out,
    stats: {
      ...(chunk.stats || {}),
      grammarVersion: GRAMMAR_VERSION,
      grammarKind: plan?.kind || 'unknown',
      grammarPlacementsConsidered: considered,
      grammarVoxelsAdded: out.length - before,
      voxels: out.length,
      truncated: Boolean(chunk.stats?.truncated || out.length >= maxVoxels)
    }
  };
}

function generateVoxelChunkWithGrammar(recipeInput, chunkX = 0, chunkZ = 0, options = {}) {
  const recipe = core.normalizeRecipe(recipeInput);
  const chunkSize = Math.max(4, Math.min(64, Math.trunc(Number(options.chunkSize) || 16)));
  const regionChunks = Math.max(1, Math.min(16, Math.trunc(Number(options.regionChunks) || 4)));
  const regionX = Math.floor(Math.trunc(chunkX) / regionChunks);
  const regionZ = Math.floor(Math.trunc(chunkZ) / regionChunks);
  const base = core.generateVoxelChunk(recipe, chunkX, chunkZ, options);
  const plan = compileRegionPlan(recipe, regionX, regionZ, { ...options, chunkSize, regionChunks });
  return applyRegionPlanToChunk(base, plan, options);
}

module.exports = {
  GRAMMAR_VERSION,
  grammarKind,
  compileRegionPlan,
  applyRegionPlanToChunk,
  generateVoxelChunkWithGrammar,
  regionKey
};
