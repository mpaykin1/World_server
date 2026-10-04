(function(){
  'use strict';

  function mod(value, n) { return ((value % n) + n) % n; }
  function floorDiv(value, n) { return Math.floor(value / n); }
  function hash32(x, z, seed) {
    let h = (Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ (seed | 0)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function familyConfig(family) {
    if (family === 'new_york') return { lot:16, road:3, minH:10, rangeH:24, wall:'BRICK', accent:'STONE', window:'GLASS', landmarkBoost:18 };
    if (family === 'ancient_chinese') return { lot:20, road:3, minH:3, rangeH:3, wall:'PLANK', accent:'BRICK', window:'GLASS', landmarkBoost:8 };
    if (family === 'tokyo') return { lot:12, road:2, minH:5, rangeH:13, wall:'BRICK', accent:'IRON', window:'GLASS', landmarkBoost:14 };
    if (family === 'future') return { lot:18, road:3, minH:14, rangeH:28, wall:'IRON', accent:'GLASS', window:'GLASS', landmarkBoost:24 };
    return { lot:20, road:3, minH:6, rangeH:10, wall:'STONE', accent:'BRICK', window:'GLASS', landmarkBoost:16 };
  }
  function blockId(BLOCK, name, fallback) { return Number.isInteger(BLOCK?.[name]) ? BLOCK[name] : fallback; }

  function structureAt(dna, cellX, cellZ) {
    const profile = dna.minecraft?.structures;
    const pool = profile?.pool;
    if (!Array.isArray(pool) || !pool.length) return null;
    const seed = Number(dna.subSeeds?.landmarks || dna.seed32 || 1);
    const roll = hash32(cellX, cellZ, seed) / 0xffffffff;
    if (roll > Number(profile.density || 0)) return null;
    return pool[hash32(cellX, cellZ, seed + 911) % pool.length];
  }

  function sample(dna, x, z) {
    if (!dna || dna.generator?.kind !== 'world-server-architecture-seed') return null;
    const family = dna.primaryFamily || 'gothic', config = familyConfig(family), lot = config.lot;
    const lx = mod(Math.floor(x), lot), lz = mod(Math.floor(z), lot);
    const cellX = floorDiv(Math.floor(x), lot), cellZ = floorDiv(Math.floor(z), lot);
    const seed = hash32(cellX, cellZ, Number(dna.subSeeds?.buildings || dna.seed32 || 1));
    const pattern = dna.urbanism?.roadPattern || 'grid';
    let road = lx < config.road || lz < config.road;
    if (pattern === 'axial') road = Math.abs(mod(Math.floor(x) + Math.floor(lot / 2), lot) - lot / 2) < config.road || lz < 2;
    if (pattern === 'bridge_spine') road = Math.abs(mod(Math.floor(z) + Math.floor(lot / 2), lot) - lot / 2) < config.road || lx < 2;
    if (pattern === 'radial' || pattern === 'radial_grid') road = road || Math.abs(Math.sin(Math.atan2(z, x) * 4)) < 0.12;
    const structure = structureAt(dna, cellX, cellZ);
    const empty = !structure && (seed & 7) === 0;
    const pad = family === 'ancient_chinese' ? 4 : 2 + ((seed >>> 4) & 1);
    const inside = lx >= pad && lx < lot - pad && lz >= pad && lz < lot - pad;
    const baseHeight = config.minH + ((seed >>> 6) % config.rangeH);
    const height = baseHeight + (structure ? config.landmarkBoost + (seed % 5) : 0);
    return { family, config, lot, lx, lz, cellX, cellZ, seed, road, empty, pad, inside, height, baseHeight, structure };
  }

  function insideAtLevel(s, yOffset) {
    if (!s.inside) return false;
    const cx = Math.abs(s.lx - (s.lot - 1) / 2), cz = Math.abs(s.lz - (s.lot - 1) / 2);
    if (s.family === 'new_york' && yOffset > 8) {
      const setback = Math.min(3, Math.floor(yOffset / 9));
      return s.lx >= s.pad + setback && s.lx < s.lot - s.pad - setback && s.lz >= s.pad + setback && s.lz < s.lot - s.pad - setback;
    }
    if (s.family === 'future' && yOffset > s.baseHeight * 0.7) return Math.max(cx, cz) <= Math.max(2, 5 - Math.floor((yOffset - s.baseHeight * 0.7) / 7));
    if (s.family === 'gothic' && s.structure && yOffset > s.baseHeight) return Math.max(cx, cz) <= Math.max(1.5, 4 - Math.floor((yOffset - s.baseHeight) / 5));
    if (s.family === 'ancient_chinese' && s.structure && yOffset > 4) return Math.max(cx, cz) <= Math.max(2, 5 - Math.floor(yOffset / 4));
    return true;
  }

  function edgeAtLevel(s, yOffset) {
    if (!insideAtLevel(s, yOffset)) return false;
    return !insideAtLevel({ ...s, lx:s.lx-1 }, yOffset) || !insideAtLevel({ ...s, lx:s.lx+1 }, yOffset) ||
      !insideAtLevel({ ...s, lz:s.lz-1 }, yOffset) || !insideAtLevel({ ...s, lz:s.lz+1 }, yOffset);
  }

  function familyBlock(s, yOffset, edge, top, BLOCK) {
    const wall = blockId(BLOCK, s.config.wall, 3), accent = blockId(BLOCK, s.config.accent, wall), glass = blockId(BLOCK, s.config.window, wall);
    if (top) {
      if (s.family === 'ancient_chinese') return accent;
      if (s.family === 'gothic') return blockId(BLOCK, 'STONE', accent);
      if (s.family === 'future') return (s.seed & 1) ? glass : accent;
      return wall;
    }
    if (!edge) return null;
    const windowBand = yOffset > 1 && ((yOffset + s.lx + s.lz) % (s.family === 'future' ? 2 : 3) === 0);
    if (s.family === 'ancient_chinese' && yOffset % 4 === 0) return accent;
    return windowBand ? glass : wall;
  }

  function column(dna, x, z, groundY, BLOCK) {
    const s = sample(dna, x, z);
    if (!s) return null;
    const out = { clearTrees:false, surfaceBlock:null, blocks:[], structure:s.structure || null };
    if (s.road) {
      out.clearTrees = true;
      out.surfaceBlock = blockId(BLOCK, s.family === 'ancient_chinese' ? 'BRICK' : 'STONE', 3);
      return out;
    }
    if (s.empty || !s.inside) {
      if (dna.biome?.flooded && ((s.seed >>> 12) & 3) === 0) {
        out.clearTrees = true;
        out.surfaceBlock = blockId(BLOCK, 'WATER', 8);
      }
      return out;
    }

    out.clearTrees = true;
    const maxY = Math.min(95, groundY + s.height);
    const ruined = Array.isArray(dna.modifiers) && dna.modifiers.includes('ruins');
    for (let y = groundY + 1; y <= maxY; y++) {
      const yOffset = y - groundY;
      if (!insideAtLevel(s, yOffset)) continue;
      const top = y === maxY || !insideAtLevel(s, yOffset + 1);
      if (ruined && yOffset > s.height * 0.55 && hash32(s.cellX + y, s.cellZ - y, s.seed) % 7 < 2) continue;
      const edge = edgeAtLevel(s, yOffset);
      let block = familyBlock(s, yOffset, edge, top, BLOCK);
      if (s.family === 'gothic' && s.structure && top && Math.max(Math.abs(s.lx-s.lot/2),Math.abs(s.lz-s.lot/2)) < 2) block = blockId(BLOCK, 'STONE', 3);
      if (s.family === 'future' && s.structure && yOffset % 7 === 0 && edge) block = blockId(BLOCK, 'IRON', 13);
      if (block !== null) out.blocks.push({ y, block });
    }
    return out;
  }

  window.ArchitectureSeedRuntime = { sample, column, familyConfig, structureAt };
})();