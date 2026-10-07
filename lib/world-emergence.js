'use strict';

const crypto = require('crypto');

const TYPE_ALIASES = Object.freeze({
  city: 'city', 'город': 'city', 'города': 'city',
  nature: 'forest', 'природа': 'forest', forest: 'forest', 'лес': 'forest', 'леса': 'forest', jungle: 'forest', 'джунгли': 'forest',
  river: 'river', 'река': 'river', 'реки': 'river',
  mountains: 'mountains', mountain: 'mountains', 'горы': 'mountains', 'гора': 'mountains',
  volcano: 'volcano', 'вулкан': 'volcano',
  village: 'village', 'деревня': 'village', 'поселок': 'village', 'посёлок': 'village',
  ruins: 'ruins', 'руины': 'ruins',
  desert: 'desert', 'пустыня': 'desert',
  ocean: 'ocean', sea: 'ocean', 'океан': 'ocean', 'море': 'ocean',
  snow: 'snow', ice: 'snow', 'снег': 'snow', 'лед': 'snow', 'лёд': 'snow',
  dragon: 'dragon', 'дракон': 'dragon'
});

const LABELS = Object.freeze({
  city: 'Город', forest: 'Природа', river: 'Река', mountains: 'Горы', volcano: 'Вулкан',
  village: 'Поселение', ruins: 'Руины', desert: 'Пустыня', ocean: 'Море', snow: 'Снег', dragon: 'Дракон'
});
const RADII = Object.freeze({ city: 34, forest: 44, river: 28, mountains: 42, volcano: 34, village: 24, ruins: 22, desert: 46, ocean: 52, snow: 44, dragon: 30 });

const RULES = Object.freeze({
  'city|forest': {
    kind: 'living_frontier', interest: 0.96,
    summary: 'Город встречается с природой: возникает живая окраина, обмен ресурсами и конфликт роста.',
    details: ['road', 'edge_houses', 'lumberyard', 'park', 'wildlife_corridor']
  },
  'city|river': {
    kind: 'riverfront', interest: 0.94,
    summary: 'Город тянется к воде: появляются переправа, набережная, рынок и защита от паводков.',
    details: ['road', 'bridge', 'docks', 'market', 'floodwall']
  },
  'forest|river': {
    kind: 'wetland_ecology', interest: 0.9,
    summary: 'Лес и река создают влажную экосистему с переходами, тропами и богатой жизнью.',
    details: ['wetland', 'wildlife_corridor', 'ford', 'fallen_logs', 'grove']
  },
  'city|mountains': {
    kind: 'foothill_city', interest: 0.91,
    summary: 'Город упирается в горы и отвечает террасами, дорогами, добычей камня и тоннелями.',
    details: ['road', 'terraces', 'quarry', 'watchtower', 'tunnel']
  },
  'forest|volcano': {
    kind: 'burn_and_regrow', interest: 0.98,
    summary: 'Вулкан разрушает лес, но пепел запускает новую, более плодородную жизнь.',
    details: ['ash_field', 'burnt_grove', 'hot_springs', 'young_forest', 'wildlife_corridor']
  },
  'city|volcano': {
    kind: 'danger_industry', interest: 0.99,
    summary: 'Опасность вулкана меняет город: защита, эвакуационные пути и новая экономика материалов.',
    details: ['evacuation_road', 'watchtower', 'lava_wall', 'obsidian_workshop', 'refuge']
  },
  'city|ruins': {
    kind: 'archaeology_district', interest: 0.88,
    summary: 'Новый город начинает жить вокруг прошлого: раскопки превращаются в район и историю.',
    details: ['old_road', 'dig_site', 'museum', 'market', 'protected_ruins']
  },
  'city|desert': {
    kind: 'oasis_trade', interest: 0.89,
    summary: 'На границе города и пустыни возникают вода, караванные пути и торговля.',
    details: ['caravan_road', 'well', 'market', 'windwall', 'oasis']
  },
  'dragon|forest': {
    kind: 'wild_lair', interest: 1,
    summary: 'Дракон превращает лес в территорию риска: меняются тропы, животные и поведение людей.',
    details: ['lair', 'burnt_grove', 'watchtower', 'hidden_trail', 'refuge']
  },
  'city|dragon': {
    kind: 'siege_ecology', interest: 1,
    summary: 'Присутствие дракона заставляет город перестраиваться вокруг угрозы и возможностей.',
    details: ['watchtower', 'refuge', 'market', 'wall', 'dragon_road']
  }
});

function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function unit(value) { return parseInt(sha(value).slice(0, 8), 16) / 0xffffffff; }
function clamp(value, min, max) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function round(value, precision = 2) { const p = 10 ** precision; return Math.round(Number(value) * p) / p; }

function normalizeMacroType(value) {
  const raw = String(value || '').trim().toLocaleLowerCase('ru-RU');
  const type = TYPE_ALIASES[raw];
  if (!type) throw Object.assign(new Error('Неизвестная большая сущность мира.'), { status: 400 });
  return type;
}

function normalizeEntity(input = {}, index = 0, seed = 1) {
  const type = normalizeMacroType(input.type || input.kind);
  const x = round(clamp(input.x ?? input.position?.x, -10000, 10000));
  const z = round(clamp(input.z ?? input.position?.z, -10000, 10000));
  const radius = round(clamp(input.radius || RADII[type] || 30, 8, 160));
  const idSource = input.id || `${seed}:${type}:${x}:${z}:${index}`;
  const id = /^macro-[a-z0-9-]{4,80}$/.test(String(input.id || '')) ? String(input.id) : `macro-${type}-${sha(idSource).slice(0, 10)}`;
  return {
    id, type, label: String(input.label || LABELS[type] || type).slice(0, 40),
    x, z, radius, strength: round(clamp(input.strength || 1, 0.2, 2), 3),
    ownerId: input.ownerId ? String(input.ownerId).slice(0, 80) : null
  };
}

function detectMacroTypes(idea) {
  const text = String(idea || '').toLocaleLowerCase('ru-RU');
  const rules = [
    [/город|city|мегаполис/u, 'city'], [/природ|лес|forest|jungle|джунг/u, 'forest'],
    [/река|river/u, 'river'], [/гор(?:а|ы|ный)|mountain/u, 'mountains'], [/вулкан|volcano/u, 'volcano'],
    [/деревн|пос[её]лок|village/u, 'village'], [/руин|ruins/u, 'ruins'], [/пустын|desert/u, 'desert'],
    [/океан|море|ocean|sea/u, 'ocean'], [/снег|л[её]д|snow|ice/u, 'snow'], [/дракон|dragon/u, 'dragon']
  ];
  const out = [];
  for (const [pattern, type] of rules) if (pattern.test(text) && !out.includes(type)) out.push(type);
  return out.slice(0, 8);
}

function layoutEntities(types, seed = 1) {
  if (!types.length) return [];
  if (types.length === 1) return [normalizeEntity({ type: types[0], x: 0, z: 0 }, 0, seed)];
  if (types.length === 2) {
    const angle = unit(`${seed}:macro-layout`) * Math.PI * 2;
    const dx = Math.cos(angle) * 30, dz = Math.sin(angle) * 30;
    return [
      normalizeEntity({ type: types[0], x: -dx, z: -dz }, 0, seed),
      normalizeEntity({ type: types[1], x: dx, z: dz }, 1, seed)
    ];
  }
  const radius = 50;
  return types.map((type, index) => {
    const angle = (index / types.length) * Math.PI * 2 + unit(`${seed}:layout-rotate`) * Math.PI * 2;
    return normalizeEntity({ type, x: Math.cos(angle) * radius, z: Math.sin(angle) * radius }, index, seed);
  });
}

function pairKey(a, b) { return [a, b].sort().join('|'); }
function relationRule(a, b) {
  return RULES[pairKey(a.type, b.type)] || {
    kind: 'contact_zone', interest: 0.76,
    summary: `${a.label} и ${b.label} начинают менять пространство между собой.`,
    details: ['trail', 'landmark', 'camp', 'exchange_zone', 'story_site']
  };
}

function distance(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

function effectFor(kind) {
  if (/road|trail/i.test(kind)) return { biome: 'plains', clearTrees: true, surface: 'road' };
  if (/park|forest|grove|wildlife|oasis|wetland/i.test(kind)) return { biome: 'forest', clearTrees: false, surface: null };
  if (/ash|burnt/i.test(kind)) return { biome: 'desert', clearTrees: true, surface: 'ash' };
  if (/terrace|quarry|wall|tower|house|market|workshop|museum|refuge|lair|site|docks|bridge|well|tunnel/i.test(kind)) return { biome: null, clearTrees: true, surface: null };
  return { biome: null, clearTrees: false, surface: null };
}

function featureFor(relation, a, b, kind, index, seed) {
  const t = (index + 1) / (relation.detailKinds.length + 1);
  const px = a.x + (b.x - a.x) * t, pz = a.z + (b.z - a.z) * t;
  const len = Math.max(1, distance(a, b));
  const nx = -(b.z - a.z) / len, nz = (b.x - a.x) / len;
  const offset = (unit(`${seed}:${relation.id}:${kind}`) - 0.5) * Math.min(18, len * 0.28);
  const linear = /road|trail|corridor/i.test(kind);
  return {
    id: `feature-${sha(`${relation.id}:${kind}`).slice(0, 12)}`,
    relationId: relation.id,
    kind,
    label: kind.replaceAll('_', ' '),
    stage: index + 1,
    x: round(px + nx * offset),
    z: round(pz + nz * offset),
    radius: round(linear ? 3.2 : 5 + unit(`${kind}:radius:${seed}`) * 5),
    geometry: linear ? {
      kind: 'line', x1: round(a.x), z1: round(a.z), x2: round(b.x), z2: round(b.z), width: round(2.2 + unit(`${kind}:width:${seed}`) * 2)
    } : { kind: 'point' },
    effect: effectFor(kind)
  };
}

function deriveRelations(entities, seed = 1, growthStage = 1) {
  const relations = [], features = [];
  for (let i = 0; i < entities.length; i++) for (let j = i + 1; j < entities.length; j++) {
    const a = entities[i], b = entities[j];
    const d = distance(a, b), reach = (a.radius + b.radius) * 1.75;
    if (d > reach) continue;
    const rule = relationRule(a, b);
    const contact = 1 - Math.min(1, d / reach);
    const relation = {
      id: `relation-${sha(`${seed}:${a.id}:${b.id}`).slice(0, 12)}`,
      a: a.id, b: b.id, kind: rule.kind, summary: rule.summary,
      distance: round(d), contact: round(contact, 3),
      interestScore: round(clamp(rule.interest * (0.75 + contact * 0.35), 0, 1), 3),
      detailKinds: rule.details.slice(0, 5)
    };
    relations.push(relation);
    const visible = Math.max(1, Math.min(relation.detailKinds.length, Math.trunc(growthStage)));
    for (let k = 0; k < visible; k++) features.push(featureFor(relation, a, b, relation.detailKinds[k], k, seed));
  }
  return { relations, features };
}

function buildEmergenceState({ entities = [], seed = 1, growthStage = 1, revision = 1 } = {}) {
  const normalized = entities.slice(0, 24).map((entity, index) => normalizeEntity(entity, index, seed));
  const stage = normalized.length >= 2 ? Math.max(1, Math.min(5, Math.trunc(growthStage) || 1)) : (normalized.length ? 1 : 0);
  const { relations, features } = deriveRelations(normalized, seed, stage);
  const relationInterest = relations.length ? relations.reduce((sum, item) => sum + item.interestScore, 0) / relations.length : 0;
  const diversity = new Set(normalized.map(item => item.type)).size;
  const interestScore = round(clamp(relationInterest * 0.82 + Math.min(1, diversity / 4) * 0.18, 0, 1), 3);
  return {
    schemaVersion: '1.0.0',
    revision: Math.max(1, Math.trunc(revision) || 1),
    growthStage: stage,
    maxGrowthStage: 5,
    entities: normalized,
    relations,
    features,
    interestScore
  };
}

function createEmergenceStateFromIdea({ idea, seed = 1 } = {}) {
  const types = detectMacroTypes(idea);
  const entities = layoutEntities(types, seed);
  return buildEmergenceState({ entities, seed, growthStage: entities.length >= 2 ? 2 : entities.length ? 1 : 0, revision: 1 });
}

function placeMacroEntity(state, input, seed = 1) {
  const current = buildEmergenceState({ entities: state?.entities || [], seed, growthStage: state?.growthStage || 1, revision: state?.revision || 1 });
  const next = normalizeEntity(input, current.entities.length, seed);
  const entities = current.entities.filter(item => item.id !== next.id);
  const nearbyIndex = entities.findIndex(item => item.type === next.type && Math.hypot(item.x - next.x, item.z - next.z) < 3);
  if (nearbyIndex >= 0) entities.splice(nearbyIndex, 1);
  entities.push(next);
  return buildEmergenceState({ entities: entities.slice(-24), seed, growthStage: entities.length >= 1 ? 1 : 0, revision: current.revision + 1 });
}

function advanceEmergence(state, seed = 1) {
  const current = buildEmergenceState({ entities: state?.entities || [], seed, growthStage: state?.growthStage || 1, revision: state?.revision || 1 });
  return buildEmergenceState({
    entities: current.entities,
    seed,
    growthStage: Math.min(current.maxGrowthStage, current.growthStage + 1),
    revision: current.revision + 1
  });
}

module.exports = {
  TYPE_ALIASES, LABELS, RADII, RULES,
  normalizeMacroType, normalizeEntity, detectMacroTypes, layoutEntities, relationRule,
  deriveRelations, buildEmergenceState, createEmergenceStateFromIdea, placeMacroEntity, advanceEmergence
};
