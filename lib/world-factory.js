'use strict';

const crypto = require('crypto');

const WORLD_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const THEMES = ['forest', 'mountains', 'islands', 'desert', 'snow', 'gothic', 'steampunk', 'ruins'];

function cleanIdea(value) {
  return String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280);
}

function cleanTitle(value) {
  const title = cleanIdea(value).slice(0, 64);
  return title || 'Новый мир';
}

function digest(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function pickTheme(idea, hex) {
  const text = idea.toLocaleLowerCase('ru-RU');
  const rules = [
    [/лес|forest|джунг|jungle/, 'forest'], [/гор|mountain|скал|rock/, 'mountains'],
    [/остров|island|океан|ocean|море|sea/, 'islands'], [/пустын|desert|песок|sand/, 'desert'],
    [/снег|snow|лед|ice/, 'snow'], [/гот|goth/, 'gothic'], [/стим|steam|механ|gear/, 'steampunk'],
    [/руин|ruin|древн|ancient/, 'ruins']
  ];
  for (const [pattern, theme] of rules) if (pattern.test(text)) return theme;
  return THEMES[parseInt(hex.slice(0, 8), 16) % THEMES.length];
}

function worldIdFromRequest(requestId) {
  if (!REQUEST_ID.test(String(requestId || ''))) throw Object.assign(new Error('requestId must be a UUID'), { status: 400 });
  return `world-${digest(requestId).slice(0, 16)}`;
}

function chooseAnchor(worldId, loreBible) {
  const ids = Object.keys(loreBible?.worlds || {}).filter((id) => WORLD_ID.test(id) && id !== worldId).sort();
  if (!ids.length) return null;
  return ids[parseInt(digest(worldId).slice(0, 8), 16) % ids.length];
}

function createWorldDNA({ idea, requestId, loreBible } = {}) {
  const clean = cleanIdea(idea);
  if (clean.length < 3) throw Object.assign(new Error('Опишите мир хотя бы тремя символами.'), { status: 400 });
  const id = worldIdFromRequest(requestId);
  const hex = digest(`${requestId}\n${clean}`);
  const seed = (parseInt(hex.slice(0, 8), 16) & 0x7fffffff) || 1;
  const title = cleanTitle(clean.split(/[.!?]/)[0]);
  const theme = pickTheme(clean, hex);
  const anchorId = chooseAnchor(id, loreBible);
  const anchorTitle = anchorId ? String(loreBible?.worlds?.[anchorId]?.headline || anchorId).slice(0, 90) : '';
  const connectionStory = anchorId
    ? `В этом мире найден след, связанный с миром «${anchorTitle}». Игроки могут изменить смысл этой связи своими действиями.`
    : 'Этот мир становится первой главой новой ветви общей истории.';
  const lore = {
    headline: `${title}: новая глава общей вселенной`,
    lore: `Мир родился из идеи игрока: «${clean}». В нём есть тайна, опасность, цель и выбор. То, что сделают игроки, может стать частью общего канона.`,
    history: 'Мир создан World Factory и сразу включён в общую историю World_server.',
    elements: ['mystery','puzzle','danger','goal','worldRule','stakes','entity','choice','twist','connection','gameplayHook','openQuestion'],
    connections: anchorId ? [{ targetId: anchorId, story: connectionStory }] : [],
    generated: true,
    generator: 'world-factory-v1'
  };
  return {
    schemaVersion: '1.0.0', id, requestId, title, idea: clean, seed, theme,
    generator: { kind: 'procedural-voxel', version: 1, chunkSize: 16, minY: -16, maxY: 96 },
    visualProfile: { qualityFloor: 85, atmosphere: true, pbr: true, microdetail: true, water: true, adaptivePerformance: true },
    lore,
    createdAt: new Date().toISOString()
  };
}

function settingsFromDNA(dna) {
  return {
    name: dna.title,
    chunkSize: dna.generator.chunkSize,
    minY: dna.generator.minY,
    maxY: dna.generator.maxY,
    generatorVersion: dna.generator.version,
    theme: dna.theme,
    worldDNA: dna,
    lore: dna.lore
  };
}

function publicWorld(row) {
  const dna = row?.settings?.worldDNA;
  if (!dna || dna.generator?.kind !== 'procedural-voxel') return null;
  return {
    id: row.id,
    title: row.settings?.name || dna.title || row.id,
    seed: Number(row.seed),
    theme: row.settings?.theme || dna.theme || 'forest',
    lore: row.settings?.lore || dna.lore || null,
    worldDNA: dna,
    playUrl: `/apps/voxel-world/?world=${encodeURIComponent(row.id)}`
  };
}

module.exports = { cleanIdea, cleanTitle, digest, pickTheme, worldIdFromRequest, chooseAnchor, createWorldDNA, settingsFromDNA, publicWorld };
