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
    if (family === 'new_york') return { lot:16, road:3, minH:10, rangeH:24, wall:'BRICK', accent:'STONE', window:'GLASS' };
    if (family === 'ancient_chinese') return { lot:20, road:3, minH:3, rangeH:3, wall:'PLANK', accent:'BRICK', window:'GLASS' };
    if (family === 'tokyo') return { lot:12, road:2, minH:5, rangeH:13, wall:'BRICK', accent:'IRON', window:'GLASS' };
    if (family === 'future') return { lot:18, road:3, minH:14, rangeH:28, wall:'IRON', accent:'GLASS', window:'GLASS' };
    return { lot:20, road:3, minH:6, rangeH:10, wall:'STONE', accent:'BRICK', window:'GLASS' };
  }
  function blockId(BLOCK, name, fallback) { return Number.isInteger(BLOCK?.[name]) ? BLOCK[name] : fallback; }

  function sample(dna, x, z) {
    if (!dna || dna.generator?.kind !== 'world-server-architecture-seed') return null;
    const family = dna.primaryFamily || 'gothic';
    const config = familyConfig(family);
    const lot = config.lot;
    const lx = mod(Math.floor(x), lot), lz = mod(Math.floor(z), lot);
    const cellX = floorDiv(Math.floor(x), lot), cellZ = floorDiv(Math.floor(z), lot);
    const seed = hash32(cellX, cellZ, Number(dna.subSeeds?.buildings || dna.seed32 || 1));
    const pattern = dna.urbanism?.roadPattern || 'grid';
    let road = lx < config.road || lz < config.road;
    if (pattern === 'axial') road = Math.abs(mod(Math.floor(x) + Math.floor(lot / 2), lot) - lot / 2) < config.road || lz < 2;
    if (pattern === 'bridge_spine') road = Math.abs(mod(Math.floor(z) + Math.floor(lot / 2), lot) - lot / 2) < config.road || lx < 2;
    if (pattern === 'radial' || pattern === 'radial_grid') {
      const angleBand = Math.abs(Math.sin(Math.atan2(z, x) * 4));
      road = road || angleBand < 0.12;
    }
    const empty = (seed & 7) === 0;
    const pad = family === 'ancient_chinese' ? 4 : 2 + ((seed >>> 4) & 1);
    const inside = lx >= pad && lx < lot - pad && lz >= pad && lz < lot - pad;
    const height = config.minH + ((seed >>> 6) % config.rangeH);
    return { family, config, lot, lx, lz, cellX, cellZ, seed, road, empty, pad, inside, height };
  }

  function familyBlock(sampled, yOffset, edge, top, BLOCK) {
    const c = sampled.config;
    const wall = blockId(BLOCK, c.wall, 3), accent = blockId(BLOCK, c.accent, wall), glass = blockId(BLOCK, c.window, wall);
    const family = sampled.family;
    if (top) {
      if (family === 'ancient_chinese') return yOffset % 2 ? accent : wall;
      if (family === 'gothic') return accent;
      if (family === 'future') return (sampled.seed & 1) ? glass : accent;
      return wall;
    }
    if (!edge) return null;
    const windowBand = yOffset > 1 && ((yOffset + sampled.lx + sampled.lz) % (family === 'future' ? 2 : 3) === 0);
    return windowBand ? glass : wall;
  }

  function column(dna, x, z, groundY, BLOCK) {
    const s = sample(dna, x, z);
    if (!s) return null;
    const out = { clearTrees:false, surfaceBlock:null, blocks:[] };
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
    const edge = s.lx === s.pad || s.lx === s.lot - s.pad - 1 || s.lz === s.pad || s.lz === s.lot - s.pad - 1;
    const ruined = Array.isArray(dna.modifiers) && dna.modifiers.includes('ruins');
    for (let y = groundY + 1; y <= maxY; y++) {
      const yOffset = y - groundY, top = y === maxY;
      if (ruined && yOffset > s.height * 0.55 && hash32(s.cellX + y, s.cellZ - y, s.seed) % 7 < 2) continue;
      let block = familyBlock(s, yOffset, edge, top, BLOCK);
      if (s.family === 'ancient_chinese' && top && (s.lx === s.pad - 1 || s.lx === s.lot - s.pad || s.lz === s.pad - 1 || s.lz === s.lot - s.pad)) {
        block = blockId(BLOCK, 'BRICK', 10);
      }
      if (s.family === 'gothic' && top && ((s.lx + s.lz) & 3) === 0) {
        for (let extra = 1; extra <= 2 && y + extra <= 95; extra++) out.blocks.push({ y:y + extra, block:blockId(BLOCK, 'STONE', 3) });
      }
      if (block !== null) out.blocks.push({ y, block });
    }
    return out;
  }

  window.ArchitectureSeedRuntime = { sample, column, familyConfig };
})();