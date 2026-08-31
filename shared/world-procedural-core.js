'use strict';

(function initWorldProceduralCore(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorldProceduralCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function worldProceduralCoreFactory() {
  const ENGINE_VERSION = '2.0.0';
  const SCHEMA_VERSION = '1.0.0';
  const BLOCKED_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
  const DEFAULT_PALETTE = Object.freeze([
    0x0b0c10, 0x17181f, 0x262832, 0x363944, 0x4b4f5b, 0x666b78, 0x858b98,
    0xa7adb9, 0x2a211e, 0x40312c, 0x55433b, 0x1f2c2a, 0x38504a, 0xb17b42
  ]);

  const clamp = (value, min, max) => Math.max(min, Math.min(max, Number(value)));
  const finite = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
  const integer = (value, fallback, min, max) => Math.trunc(clamp(finite(value, fallback), min, max));
  const boundedString = (value, fallback, max = 96) => {
    const str = String(value == null ? fallback : value).trim();
    return (str || String(fallback)).slice(0, max);
  };

  function sanitizeWorldId(value) {
    const id = boundedString(value, 'main', 40).replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-');
    return id || 'main';
  }

  function stableClone(value, seen = new WeakSet()) {
    if (value == null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return value.map((item) => stableClone(item, seen));
    if (typeof value !== 'object') return null;
    if (seen.has(value)) throw new TypeError('world recipe must be acyclic');
    seen.add(value);
    const out = {};
    for (const key of Object.keys(value).sort()) {
      if (BLOCKED_KEYS.has(key)) continue;
      if (typeof value[key] === 'undefined' || typeof value[key] === 'function') continue;
      out[key] = stableClone(value[key], seen);
    }
    seen.delete(value);
    return out;
  }

  function stableStringify(value) {
    return JSON.stringify(stableClone(value));
  }

  function stringHash32(value) {
    const str = String(value ?? '');
    let hash = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  function seedToUint32(seed) {
    if (Number.isFinite(Number(seed))) return Number(seed) >>> 0;
    return stringHash32(seed || 'world-server');
  }

  function mulberry32(seed) {
    let state = seedToUint32(seed);
    return function random() {
      state |= 0;
      state = (state + 0x6d2b79f5) | 0;
      let t = Math.imul(state ^ (state >>> 15), 1 | state);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashCoords2D(x, z, seed) {
    let h = (Math.imul(Math.trunc(x), 0x1f123bb5) ^ Math.imul(Math.trunc(z), 0x5f356495) ^ seedToUint32(seed)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return (h ^ (h >>> 16)) >>> 0;
  }

  const unitHash2D = (x, z, seed) => hashCoords2D(x, z, seed) / 0xffffffff;
  const smooth = (t) => t * t * (3 - 2 * t);
  const lerp = (a, b, t) => a + (b - a) * t;

  function valueNoise2D(x, z, seed) {
    const x0 = Math.floor(x), z0 = Math.floor(z), x1 = x0 + 1, z1 = z0 + 1;
    const tx = smooth(x - x0), tz = smooth(z - z0);
    const a = lerp(unitHash2D(x0, z0, seed), unitHash2D(x1, z0, seed), tx);
    const b = lerp(unitHash2D(x0, z1, seed), unitHash2D(x1, z1, seed), tx);
    return lerp(a, b, tz) * 2 - 1;
  }

  function fbm2D(x, z, options = {}) {
    const octaves = integer(options.octaves, 4, 1, 8);
    const lacunarity = clamp(finite(options.lacunarity, 2), 1.2, 4);
    const gain = clamp(finite(options.gain, 0.5), 0.2, 0.85);
    const seed = seedToUint32(options.seed);
    let frequency = Math.max(0.000001, finite(options.frequency, 0.035));
    let amplitude = 1;
    let sum = 0;
    let weight = 0;
    for (let octave = 0; octave < octaves; octave += 1) {
      sum += valueNoise2D(x * frequency, z * frequency, seed + Math.imul(octave + 1, 0x9e3779b1)) * amplitude;
      weight += amplitude;
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return weight ? sum / weight : 0;
  }

  function deepMerge(base, patch) {
    if (Array.isArray(patch)) return patch.map((item) => stableClone(item));
    if (!patch || typeof patch !== 'object') return patch;
    const out = (base && typeof base === 'object' && !Array.isArray(base)) ? stableClone(base) : {};
    for (const key of Object.keys(patch)) {
      if (BLOCKED_KEYS.has(key)) continue;
      const value = patch[key];
      if (typeof value === 'undefined' || typeof value === 'function') continue;
      if (value && typeof value === 'object' && !Array.isArray(value)) out[key] = deepMerge(out[key], value);
      else out[key] = stableClone(value);
    }
    return out;
  }

  function normalizeRecipe(input = {}) {
    const sourceMessageHash32 = input.sourceMessage == null
      ? integer(input?.source?.sourceMessageHash32, 0, 0, 0xffffffff)
      : stringHash32(String(input.sourceMessage).slice(0, 4096));
    const seed = seedToUint32(input.seed ?? input.worldId ?? 'world-server');

    return {
      schemaVersion: SCHEMA_VERSION,
      engineVersion: ENGINE_VERSION,
      worldId: sanitizeWorldId(input.worldId),
      revision: integer(input.revision, 0, 0, 2147483647),
      seed,
      source: {
        sourceMessageHash32,
        navigatorTurn: integer(input?.source?.navigatorTurn, 0, 0, 2147483647)
      },
      style: {
        artStyle: boundedString(input?.style?.artStyle, 'voxel', 32),
        voxelScale: clamp(finite(input?.style?.voxelScale, 1), 0.25, 8),
        detail: clamp(finite(input?.style?.detail, 0.72), 0, 1),
        pixelScale: clamp(finite(input?.style?.pixelScale, 1), 0.25, 8),
        materialTheme: boundedString(input?.style?.materialTheme, 'inherit', 48),
        wetness: clamp(finite(input?.style?.wetness, 0.12), 0, 1),
        emissive: clamp(finite(input?.style?.emissive, 0.05), 0, 1)
      },
      terrain: {
        kind: boundedString(input?.terrain?.kind, 'organic', 32),
        baseHeight: integer(input?.terrain?.baseHeight, 8, -48, 256),
        amplitude: clamp(finite(input?.terrain?.amplitude, 12), 0, 96),
        frequency: clamp(finite(input?.terrain?.frequency, 0.035), 0.001, 0.35),
        octaves: integer(input?.terrain?.octaves, 4, 1, 8),
        lacunarity: clamp(finite(input?.terrain?.lacunarity, 2), 1.2, 4),
        gain: clamp(finite(input?.terrain?.gain, 0.5), 0.2, 0.85),
        erosion: clamp(finite(input?.terrain?.erosion, 0.15), 0, 1),
        caveDensity: clamp(finite(input?.terrain?.caveDensity, 0), 0, 0.6)
      },
      architecture: {
        kind: boundedString(input?.architecture?.kind, 'none', 40),
        density: clamp(finite(input?.architecture?.density, 0.08), 0, 1),
        verticality: clamp(finite(input?.architecture?.verticality, 0.5), 0, 1),
        ruin: clamp(finite(input?.architecture?.ruin, 0.08), 0, 1),
        repetition: clamp(finite(input?.architecture?.repetition, 0.35), 0, 1)
      },
      atmosphere: {
        fog: clamp(finite(input?.atmosphere?.fog, 0.35), 0, 1),
        darkness: clamp(finite(input?.atmosphere?.darkness, 0.55), 0, 1),
        wind: clamp(finite(input?.atmosphere?.wind, 0.15), 0, 1),
        weather: boundedString(input?.atmosphere?.weather, 'none', 32)
      },
      animation: {
        enabled: input?.animation?.enabled !== false,
        frameTimeline: input?.animation?.frameTimeline !== false,
        ambientMotion: clamp(finite(input?.animation?.ambientMotion, 0.3), 0, 1)
      },
      audio: {
        mode: boundedString(input?.audio?.mode, 'procedural', 24),
        ambience: boundedString(input?.audio?.ambience, 'dark-air', 40),
        intensity: clamp(finite(input?.audio?.intensity, 0.25), 0, 1),
        seedOffset: integer(input?.audio?.seedOffset, 193, -2147483648, 2147483647)
      },
      performance: {
        targetFps: integer(input?.performance?.targetFps, 60, 24, 240),
        priority: boundedString(input?.performance?.priority, 'adaptive', 24),
        maxChunkVoxels: integer(input?.performance?.maxChunkVoxels, 12000, 512, 120000)
      }
    };
  }

  function diffObject(previous, next) {
    if (stableStringify(previous) === stableStringify(next)) return undefined;
    if (!previous || !next || typeof previous !== 'object' || typeof next !== 'object' || Array.isArray(previous) || Array.isArray(next)) return stableClone(next);
    const out = {};
    for (const key of Object.keys(next)) {
      if (BLOCKED_KEYS.has(key)) continue;
      const diff = diffObject(previous[key], next[key]);
      if (typeof diff !== 'undefined') out[key] = diff;
    }
    return Object.keys(out).length ? out : undefined;
  }

  function applyDelta(previous, delta) {
    return deepMerge(previous, delta || {});
  }

  function sampleTerrainHeight(recipeInput, x, z) {
    const recipe = recipeInput && recipeInput.schemaVersion === SCHEMA_VERSION && recipeInput.engineVersion === ENGINE_VERSION
      ? recipeInput
      : normalizeRecipe(recipeInput);
    const t = recipe.terrain;
    const primary = fbm2D(x, z, { seed: recipe.seed, frequency: t.frequency, octaves: t.octaves, lacunarity: t.lacunarity, gain: t.gain });
    const erosionNoise = fbm2D(x + 173.3, z - 91.7, { seed: recipe.seed ^ 0xa341316c, frequency: t.frequency * 0.55, octaves: 2, gain: 0.55 });
    const shaped = primary * (1 - t.erosion * 0.35) + Math.abs(erosionNoise) * t.erosion * 0.35;
    return Math.max(-64, Math.min(320, Math.round(t.baseHeight + shaped * t.amplitude)));
  }

  function paletteIndexFor(recipe, x, y, z, topY) {
    if (y === topY) {
      const wet = recipe.style.wetness;
      const n = unitHash2D(x, z, recipe.seed ^ 0x85ebca6b);
      if (wet > 0.5 && n < wet * 0.65) return 11;
      if (recipe.style.emissive > 0.35 && n > 1 - recipe.style.emissive * 0.2) return 13;
      return n > 0.72 ? 4 : 2;
    }
    return ((x + z + y) & 7) === 0 ? 3 : 1;
  }

  function generateVoxelChunk(recipeInput, chunkX = 0, chunkZ = 0, options = {}) {
    const recipe = normalizeRecipe(recipeInput);
    const chunkSize = integer(options.chunkSize, 16, 4, 64);
    const surfaceDepth = integer(options.surfaceDepth, 3, 1, 8);
    const maxVoxels = integer(options.maxVoxels, recipe.performance.maxChunkVoxels, 128, 120000);
    const originX = Math.trunc(chunkX) * chunkSize;
    const originZ = Math.trunc(chunkZ) * chunkSize;
    const voxels = [];
    let truncated = false;

    outer: for (let localZ = 0; localZ < chunkSize; localZ += 1) {
      for (let localX = 0; localX < chunkSize; localX += 1) {
        const x = originX + localX;
        const z = originZ + localZ;
        const topY = sampleTerrainHeight(recipe, x, z);
        const bottom = Math.max(-64, topY - surfaceDepth + 1);
        for (let y = bottom; y <= topY; y += 1) {
          if (voxels.length >= maxVoxels) { truncated = true; break outer; }
          voxels.push([x, y, z, paletteIndexFor(recipe, x, y, z, topY)]);
        }
      }
    }

    const structureChance = unitHash2D(chunkX, chunkZ, recipe.seed ^ 0xc2b2ae35);
    if (!truncated && recipe.architecture.kind !== 'none' && structureChance < recipe.architecture.density) {
      const centerX = originX + Math.floor(chunkSize * (0.3 + unitHash2D(chunkX + 11, chunkZ, recipe.seed) * 0.4));
      const centerZ = originZ + Math.floor(chunkSize * (0.3 + unitHash2D(chunkX, chunkZ + 17, recipe.seed) * 0.4));
      const ground = sampleTerrainHeight(recipe, centerX, centerZ);
      const height = Math.max(2, Math.round(4 + recipe.architecture.verticality * 24));
      const width = recipe.architecture.repetition > 0.55 ? 2 : 1;
      for (let dy = 1; dy <= height && !truncated; dy += 1) {
        for (let dx = 0; dx < width && !truncated; dx += 1) {
          for (let dz = 0; dz < width; dz += 1) {
            if (voxels.length >= maxVoxels) { truncated = true; break; }
            const ruinCut = unitHash2D(centerX + dx + dy * 3, centerZ + dz - dy * 5, recipe.seed ^ 0x27d4eb2f);
            if (ruinCut < recipe.architecture.ruin * 0.18) continue;
            voxels.push([centerX + dx, Math.min(320, ground + dy), centerZ + dz, dy === height ? 13 : 5]);
          }
        }
      }
    }

    return {
      engineVersion: ENGINE_VERSION,
      recipeRevision: recipe.revision,
      chunk: { x: Math.trunc(chunkX), z: Math.trunc(chunkZ), size: chunkSize },
      palette: DEFAULT_PALETTE.slice(),
      voxels,
      stats: { voxels: voxels.length, maxVoxels, truncated, surfaceDepth }
    };
  }

  return Object.freeze({
    ENGINE_VERSION,
    SCHEMA_VERSION,
    DEFAULT_PALETTE,
    clamp,
    finite,
    integer,
    sanitizeWorldId,
    stableClone,
    stableStringify,
    stringHash32,
    seedToUint32,
    mulberry32,
    hashCoords2D,
    valueNoise2D,
    fbm2D,
    deepMerge,
    normalizeRecipe,
    diffObject,
    applyDelta,
    sampleTerrainHeight,
    generateVoxelChunk
  });
});
