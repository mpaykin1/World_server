'use strict';

const crypto = require('crypto');
const { collapseFacadeGrid } = require('./architecture-grammar');

const VERSION = 1;
const FAMILY_ORDER = ['gothic', 'new_york', 'ancient_chinese', 'tokyo', 'future'];

const FAMILIES = Object.freeze({
  gothic: Object.freeze({
    aliases: ['gothic', 'готик', 'готич', 'собор', 'cathedral'],
    roads: ['radial', 'organic', 'bridge_spine'], districts: ['cathedral', 'market', 'old_town', 'fortified'],
    density: 0.66, verticality: 0.62, symmetry: 0.7, courtyard: 0.12,
    base: ['stone_plinth', 'arcade'], body: ['pointed_arch', 'buttress', 'tracery_bay'],
    crown: ['pinnacle', 'bell_tower', 'flying_buttress'], roof: ['steep_gable', 'spire', 'vault'],
    facade: ['lancet', 'rose_window', 'stone_bay'], landmark: ['cathedral', 'gate_tower', 'bridge_chapel']
  }),
  new_york: Object.freeze({
    aliases: ['new york', 'new_york', 'nyc', 'нью-йорк', 'нью йорк', 'манхэттен'],
    roads: ['grid', 'avenue_grid'], districts: ['midtown', 'downtown', 'brownstone', 'waterfront'],
    density: 0.94, verticality: 0.92, symmetry: 0.78, courtyard: 0.06,
    base: ['retail_podium', 'stone_lobby'], body: ['setback_tower', 'brick_bay', 'glass_grid'],
    crown: ['art_deco_crown', 'mechanical_penthouse', 'needle'], roof: ['flat', 'stepped', 'spire'],
    facade: ['masonry_window', 'curtain_wall', 'fire_escape_bay'], landmark: ['skyscraper', 'station', 'bridge_tower']
  }),
  ancient_chinese: Object.freeze({
    aliases: ['ancient china', 'ancient_chinese', 'chinese', 'китай', 'китайск', 'древнекитай'],
    roads: ['axial', 'courtyard_grid'], districts: ['palace', 'hutong', 'temple', 'market'],
    density: 0.6, verticality: 0.27, symmetry: 0.94, courtyard: 0.88,
    base: ['stone_platform', 'courtyard_wall'], body: ['timber_bay', 'screen_wall', 'colonnade'],
    crown: ['gate_tower', 'drum_tower', 'pagoda_stage'], roof: ['hip_and_gable', 'swept_eaves', 'pagoda'],
    facade: ['timber_screen', 'red_column', 'lattice_window'], landmark: ['pagoda', 'palace_gate', 'drum_tower']
  }),
  tokyo: Object.freeze({
    aliases: ['tokyo', 'токио', 'япон', 'japan'],
    roads: ['organic_grid', 'rail_nodes', 'narrow_lanes'], districts: ['station', 'dense_mixed', 'residential', 'neon_core'],
    density: 0.89, verticality: 0.72, symmetry: 0.43, courtyard: 0.16,
    base: ['shopfront', 'station_podium'], body: ['narrow_mixed_use', 'balcony_stack', 'glass_office'],
    crown: ['sign_crown', 'roof_plant', 'antenna'], roof: ['flat', 'compact_gable', 'utility_roof'],
    facade: ['sign_band', 'balcony', 'tile_bay'], landmark: ['station_complex', 'observation_tower', 'crossing']
  }),
  future: Object.freeze({
    aliases: ['future', 'futur', 'будущ', 'кибер', 'cyber', 'sci-fi', 'scifi'],
    roads: ['multilevel', 'radial_grid', 'skybridge_network'], districts: ['megacore', 'habitat', 'industry', 'vertical_park'],
    density: 0.93, verticality: 0.98, symmetry: 0.62, courtyard: 0.2,
    base: ['mega_podium', 'transit_hub'], body: ['arcology_stack', 'tapered_tower', 'void_bridge'],
    crown: ['sky_garden', 'energy_crown', 'antenna_forest'], roof: ['landing_deck', 'glass_crown', 'solar_canopy'],
    facade: ['light_rib', 'adaptive_panel', 'mega_window'], landmark: ['arcology', 'skybridge_hub', 'orbital_tower']
  })
});

const MODIFIERS = Object.freeze({
  jungle: ['jungle', 'джунг', 'tropical', 'тропич'],
  flooded: ['flood', 'затоп', 'underwater', 'подвод'],
  ruins: ['ruin', 'руин', 'abandon', 'заброш'],
  desert: ['desert', 'пустын'],
  snow: ['snow', 'снег', 'ice', 'лед', 'лёд'],
  volcanic: ['volcano', 'вулкан', 'lava', 'лава'],
  islands: ['island', 'остров']
});

function hashHex(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function normalizeSeedKey(value, fallback = '1') {
  const raw = String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!raw) return normalizeSeedKey(fallback, '1');
  if (/^[+-]?\d{1,80}$/.test(raw)) return BigInt(raw).toString();
  return raw.slice(0, 128);
}

function seed32FromKey(seed, lane = 'world') {
  const key = normalizeSeedKey(seed);
  const n = parseInt(hashHex(`architecture-seed-v${VERSION}:${key}:${lane}`).slice(0, 8), 16) >>> 0;
  return n || 1;
}

function unit(seed, lane) {
  const hex = hashHex(`architecture-seed-v${VERSION}:${normalizeSeedKey(seed)}:${lane}`).slice(0, 12);
  return parseInt(hex, 16) / 0xffffffffffff;
}

function clamp01(value) { return Math.max(0, Math.min(1, Number(value) || 0)); }
function jitter(seed, lane, center, spread = 0.12) { return clamp01(center + (unit(seed, lane) - 0.5) * spread * 2); }
function pick(seed, lane, values) { return values[Math.min(values.length - 1, Math.floor(unit(seed, lane) * values.length))]; }

function detectFamilies(idea = '') {
  const text = String(idea).toLocaleLowerCase('ru-RU');
  const out = [];
  for (const key of FAMILY_ORDER) if (FAMILIES[key].aliases.some(alias => text.includes(alias))) out.push(key);
  return out;
}

function detectModifiers(idea = '', theme = '') {
  const text = `${idea} ${theme}`.toLocaleLowerCase('ru-RU');
  return Object.entries(MODIFIERS).filter(([, aliases]) => aliases.some(alias => text.includes(alias))).map(([key]) => key);
}

function blendFor(seedKey, requested) {
  const keys = requested.length ? requested.slice(0, 3) : [pick(seedKey, 'family:auto', FAMILY_ORDER)];
  if (keys.length === 1) return [{ family: keys[0], weight: 1 }];
  const raw = keys.map((family, index) => ({ family, weight: (index === 0 ? 0.8 : 0.35) + unit(seedKey, `blend:${family}`) * 0.35 }));
  const total = raw.reduce((sum, item) => sum + item.weight, 0);
  return raw.map(item => ({ family: item.family, weight: Number((item.weight / total).toFixed(4)) }));
}

function blended(blend, field) {
  return blend.reduce((sum, item) => sum + FAMILIES[item.family][field] * item.weight, 0);
}

function subSeeds(seedKey) {
  const lanes = ['terrain', 'biome', 'roads', 'districts', 'buildings', 'details', 'history', 'water', 'vegetation', 'landmarks'];
  return Object.fromEntries(lanes.map(lane => [lane, seed32FromKey(seedKey, lane)]));
}

function historyState(seedKey, modifiers) {
  if (modifiers.includes('flooded')) return 'flooded';
  if (modifiers.includes('ruins')) return 'ruined';
  const states = ['intact', 'weathered', 'rebuilt', 'partially_ruined'];
  return pick(seedKey, 'history:state', states);
}

function biomeProfile(seedKey, modifiers, theme) {
  const primary = modifiers.find(x => ['jungle', 'desert', 'snow', 'volcanic', 'islands'].includes(x)) || String(theme || 'mixed');
  return {
    primary,
    flooded: modifiers.includes('flooded'),
    ruins: modifiers.includes('ruins'),
    overgrowth: modifiers.includes('jungle') ? jitter(seedKey, 'biome:overgrowth', 0.82, 0.15) : jitter(seedKey, 'biome:overgrowth', 0.22, 0.2),
    waterLevelBias: modifiers.includes('flooded') ? jitter(seedKey, 'biome:water', 0.84, 0.12) : jitter(seedKey, 'biome:water', 0.25, 0.2)
  };
}

function createArchitectureDNA({ seed = 1, idea = '', theme = 'mixed' } = {}) {
  const seedKey = normalizeSeedKey(seed);
  const requested = detectFamilies(idea);
  const blend = blendFor(seedKey, requested);
  const primaryFamily = blend[0].family;
  const primary = FAMILIES[primaryFamily];
  const modifiers = detectModifiers(idea, theme);
  return {
    schemaVersion: '1.0.0',
    generator: { kind: 'world-server-architecture-seed', version: VERSION },
    seedKey,
    seed32: seed32FromKey(seedKey, 'architecture'),
    subSeeds: subSeeds(seedKey),
    primaryFamily,
    blend,
    modifiers,
    urbanism: {
      roadPattern: pick(seedKey, 'roads:pattern', primary.roads),
      density: Number(jitter(seedKey, 'urban:density', blended(blend, 'density'), 0.1).toFixed(4)),
      verticality: Number(jitter(seedKey, 'urban:verticality', blended(blend, 'verticality'), 0.1).toFixed(4)),
      symmetry: Number(jitter(seedKey, 'urban:symmetry', blended(blend, 'symmetry'), 0.08).toFixed(4)),
      courtyardBias: Number(jitter(seedKey, 'urban:courtyard', blended(blend, 'courtyard'), 0.08).toFixed(4))
    },
    biome: biomeProfile(seedKey, modifiers, theme),
    history: {
      state: historyState(seedKey, modifiers),
      ageYears: 30 + Math.floor(unit(seedKey, 'history:age') * 1770),
      reconstruction: Number(unit(seedKey, 'history:reconstruction').toFixed(4))
    },
    grammar: {
      base: primary.base, body: primary.body, crown: primary.crown, roof: primary.roof,
      facade: primary.facade, landmark: primary.landmark, districts: primary.districts
    }
  };
}

function sampleDistrict(dna, x, z) {
  const lane = `district:${Math.floor(Number(x) / 64)}:${Math.floor(Number(z) / 64)}`;
  const style = pick(dna.seedKey, `${lane}:style`, dna.blend.map(item => item.family));
  const family = FAMILIES[style] || FAMILIES[dna.primaryFamily];
  return {
    style,
    type: pick(dna.seedKey, `${lane}:type`, family.districts),
    density: Number(jitter(dna.seedKey, `${lane}:density`, dna.urbanism.density, 0.14).toFixed(4)),
    landmarkChance: Number((0.03 + unit(dna.seedKey, `${lane}:landmark`) * 0.11).toFixed(4))
  };
}

function facadeSequence(seedKey, family, length) {
  const modules = FAMILIES[family].facade;
  const out = [];
  for (let i = 0; i < length; i++) {
    let value = pick(seedKey, `facade:${i}`, modules);
    if (i > 1 && out[i - 1] === value && out[i - 2] === value) value = modules[(modules.indexOf(value) + 1) % modules.length];
    out.push(value);
  }
  return out;
}

function sampleCityPlan(dna, { x = 0, z = 0, size = 256 } = {}) {
  const cx = Number(x) || 0, cz = Number(z) || 0;
  const span = Math.max(96, Math.min(1024, Number(size) || 256));
  const half = span / 2, roads = [];
  const pattern = dna.urbanism.roadPattern;
  const line = (x1, z1, x2, z2, width = 4, level = 0, type = 'street') => {
    if (roads.length < 64) roads.push({ kind: 'line', x1, z1, x2, z2, width, level, type });
  };
  const polyline = (points, width = 3, level = 0, type = 'street') => {
    if (roads.length < 64) roads.push({ kind: 'polyline', points, width, level, type });
  };
  const spacing = Math.max(18, Math.round(52 - dna.urbanism.density * 28));

  if (['grid', 'avenue_grid', 'courtyard_grid'].includes(pattern)) {
    const count = Math.min(11, Math.max(3, Math.floor(span / spacing)));
    for (let i = -count; i <= count; i++) {
      const offset = i * spacing;
      if (Math.abs(offset) > half) continue;
      const avenue = pattern === 'avenue_grid' && i % 3 === 0;
      line(cx + offset, cz - half, cx + offset, cz + half, avenue ? 7 : 4, 0, avenue ? 'avenue' : 'street');
      line(cx - half, cz + offset, cx + half, cz + offset, avenue ? 7 : 4, 0, avenue ? 'avenue' : 'street');
    }
  } else if (['radial', 'radial_grid'].includes(pattern)) {
    const spokes = 6 + Math.floor(unit(dna.seedKey, 'city:spokes') * 4);
    for (let i = 0; i < spokes; i++) {
      const angle = (Math.PI * 2 * i) / spokes + unit(dna.seedKey, 'city:rotation') * 0.3;
      line(cx, cz, cx + Math.cos(angle) * half, cz + Math.sin(angle) * half, i % 2 ? 4 : 6, 0, 'radial');
    }
    for (const radius of [half * 0.32, half * 0.62]) {
      const points = Array.from({ length: 17 }, (_, i) => {
        const angle = (Math.PI * 2 * i) / 16;
        return { x: cx + Math.cos(angle) * radius, z: cz + Math.sin(angle) * radius };
      });
      polyline(points, 4, 0, 'ring');
    }
  } else if (pattern === 'axial') {
    line(cx, cz - half, cx, cz + half, 8, 0, 'ceremonial_axis');
    line(cx - half, cz, cx + half, cz, 6, 0, 'cross_axis');
    for (const side of [-1, 1]) line(cx + side * spacing, cz - half * 0.75, cx + side * spacing, cz + half * 0.75, 3, 0, 'lane');
  } else if (pattern === 'bridge_spine') {
    line(cx - half, cz, cx + half, cz, 7, 0, 'bridge_spine');
    for (let i = -3; i <= 3; i++) {
      const ox = i * (span / 8);
      line(cx + ox, cz - half * 0.42, cx + ox, cz + half * 0.42, 3, 0, 'old_street');
    }
  } else if (['multilevel', 'skybridge_network'].includes(pattern)) {
    const step = Math.max(28, spacing);
    for (let i = -3; i <= 3; i++) {
      const offset = i * step;
      line(cx + offset, cz - half, cx + offset, cz + half, i === 0 ? 8 : 4, 0, 'ground');
      line(cx - half, cz + offset, cx + half, cz + offset, i === 0 ? 8 : 4, 0, 'ground');
      if (i % 2 === 0) line(cx - half * 0.7, cz + offset, cx + half * 0.7, cz + offset, 3, 1, 'skybridge');
    }
  } else {
    const paths = pattern === 'rail_nodes' ? 7 : 9;
    for (let p = 0; p < paths; p++) {
      const points = [];
      let px = cx + (unit(dna.seedKey, `city:path:${p}:x`) - 0.5) * span * 0.7;
      let pz = cz - half;
      for (let step = 0; step < 7; step++) {
        px += (unit(dna.seedKey, `city:path:${p}:${step}:bend`) - 0.5) * spacing;
        pz = cz - half + (span * step) / 6;
        points.push({ x: Number(px.toFixed(2)), z: Number(pz.toFixed(2)) });
      }
      polyline(points, pattern === 'rail_nodes' && p % 3 === 0 ? 6 : 3, 0, pattern === 'rail_nodes' ? 'mixed_transit' : 'lane');
    }
  }

  const districtAnchors = [[-0.3,-0.3],[0.3,-0.3],[-0.3,0.3],[0.3,0.3]].map(([dx,dz]) => {
    const px = cx + span * dx, pz = cz + span * dz;
    return { x: px, z: pz, ...sampleDistrict(dna, px, pz) };
  });
  return { pattern, center: { x: cx, z: cz }, size: span, plotSize: spacing, roads, districtAnchors };
}

function sampleBuildingRecipe(dna, { x = 0, z = 0, lotWidth = 10, lotDepth = 12 } = {}) {
  const district = sampleDistrict(dna, x, z);
  const family = FAMILIES[district.style];
  const lane = `building:${Math.round(x)}:${Math.round(z)}`;
  const floors = Math.max(1, Math.round(2 + dna.urbanism.verticality * 34 * (0.45 + unit(dna.seedKey, `${lane}:floors`) * 0.85)));
  const facadeSlots = Math.max(2, Math.min(16, Math.round(Number(lotWidth) / 2)));
  const landmark = unit(dna.seedKey, `${lane}:landmark`) < district.landmarkChance;
  const recipe = {
    family: district.style,
    district: district.type,
    footprint: { width: Math.max(4, Number(lotWidth) || 10), depth: Math.max(4, Number(lotDepth) || 12) },
    floors,
    floorHeight: Number((2.7 + unit(dna.seedKey, `${lane}:floorHeight`) * 1.5).toFixed(2)),
    base: pick(dna.seedKey, `${lane}:base`, family.base),
    body: pick(dna.seedKey, `${lane}:body`, family.body),
    crown: pick(dna.seedKey, `${lane}:crown`, family.crown),
    roof: pick(dna.seedKey, `${lane}:roof`, family.roof),
    facade: facadeSequence(`${dna.seedKey}:${lane}`, district.style, facadeSlots),
    landmark: landmark ? pick(dna.seedKey, `${lane}:landmark:type`, family.landmark) : null,
    modifiers: dna.modifiers.slice()
  };
  recipe.facadePattern = collapseFacadeGrid(dna, recipe, { width: facadeSlots, height: Math.min(12, floors) });
  return recipe;
}

function scoreArchitectureDNA(dna, criteria = {}) {
  let score = 12;
  score += dna.blend.length > 1 ? 4 : 0;
  score += Math.min(8, dna.modifiers.length * 2);
  score += dna.biome.flooded ? 4 : 0;
  score += dna.biome.ruins ? 3 : 0;
  score += dna.urbanism.verticality * 9;
  score += dna.urbanism.density * 6;
  score += dna.urbanism.courtyardBias * 4;
  score += Math.abs(dna.urbanism.verticality - dna.urbanism.density) * 8;
  score += Math.abs(dna.urbanism.symmetry - 0.5) * 8;
  score += Math.min(8, (dna.history.ageYears / 1800) * 8);
  score += Math.abs(dna.history.reconstruction - 0.5) * 8;
  if (['bridge_spine', 'multilevel', 'skybridge_network', 'axial'].includes(dna.urbanism.roadPattern)) score += 5;
  if (criteria.family) score += dna.blend.some(x => x.family === criteria.family) ? 14 : -22;
  for (const modifier of criteria.modifiers || []) score += dna.modifiers.includes(modifier) ? 7 : -12;
  return Math.max(0, Math.min(100, Number(score.toFixed(2))));
}

function huntArchitectureSeeds({ startSeed = '1', count = 256, idea = '', theme = 'mixed', criteria = {}, limit = 12 } = {}) {
  const startKey = normalizeSeedKey(startSeed);
  const numeric = /^-?\d+$/.test(startKey) ? BigInt(startKey) : null;
  const boundedCount = Math.max(1, Math.min(5000, Math.floor(Number(count) || 256)));
  const rows = [];
  for (let i = 0; i < boundedCount; i++) {
    const seedKey = numeric === null ? `${startKey}:${i}` : (numeric + BigInt(i)).toString();
    const dna = createArchitectureDNA({ seed: seedKey, idea, theme });
    rows.push({ seedKey, score: scoreArchitectureDNA(dna, criteria), primaryFamily: dna.primaryFamily, modifiers: dna.modifiers, roadPattern: dna.urbanism.roadPattern, history: dna.history.state });
  }
  rows.sort((a, b) => b.score - a.score || a.seedKey.localeCompare(b.seedKey));
  return rows.slice(0, Math.max(1, Math.min(50, Math.floor(Number(limit) || 12))));
}

module.exports = {
  VERSION, FAMILIES, normalizeSeedKey, seed32FromKey, detectFamilies, detectModifiers,
  createArchitectureDNA, sampleDistrict, sampleCityPlan, sampleBuildingRecipe, scoreArchitectureDNA, huntArchitectureSeeds
};
