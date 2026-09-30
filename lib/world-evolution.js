'use strict';

const DEFAULT_STAGES = Object.freeze([
  ['cube', 0.00, 0.16],
  ['matter', 0.10, 0.36],
  ['terrain', 0.24, 0.52],
  ['biome', 0.38, 0.66],
  ['architecture', 0.50, 0.78],
  ['materials', 0.60, 0.86],
  ['lighting', 0.68, 0.93],
  ['life', 0.78, 1.00],
  ['final', 0.92, 1.00]
]);

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

function cleanSeed(value) {
  if (Number.isInteger(value) && value > 0) return value >>> 0;
  let hash = 2166136261;
  for (const char of String(value || 'world-evolution-v1')) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash || 1;
}

function normalizeTimeline(input) {
  const source = Array.isArray(input) && input.length ? input : DEFAULT_STAGES;
  return source.map((item) => {
    const [name, start, end] = Array.isArray(item)
      ? item
      : [item.name, item.start, item.end];
    const a = clamp01(start);
    const b = Math.max(a, clamp01(end));
    return { name: String(name || 'stage'), start: a, end: b };
  });
}

function compileWorldEvolutionRecipe(input = {}) {
  const recipe = {
    schemaVersion: '1.0.0',
    type: 'WorldEvolutionRecipe',
    seed: cleanSeed(input.seed),
    style: String(input.style || 'CINEMATIC_VOXEL_ART'),
    quality: String(input.quality || 'KRIEGER_CLASS_PLUS'),
    durationSeconds: Math.max(6, Math.min(30, Number(input.durationSeconds) || 12)),
    initialSeed: 'CUBE',
    terrain: { radius: 9, relief: 3.4, ...(input.terrain || {}) },
    biome: { trees: 5, grass: 140, rocks: 22, ...(input.biome || {}) },
    architecture: { kind: 'ARCH_TOWER', blocks: 112, ...(input.architecture || {}) },
    materials: { evolution: true, wetness: 0.18, moss: 0.32, ...(input.materials || {}) },
    lighting: { evolution: true, fog: true, sunrise: true, ...(input.lighting || {}) },
    life: { walkers: 1, birds: 3, wind: true, ...(input.life || {}) },
    timeline: normalizeTimeline(input.timeline)
  };
  return Object.freeze(recipe);
}

function stageProgress(stage, t) {
  const p = clamp01(t);
  if (p <= stage.start) return 0;
  if (p >= stage.end) return 1;
  return (p - stage.start) / Math.max(0.0001, stage.end - stage.start);
}

function sampleEvolution(recipe, t) {
  const progress = clamp01(t);
  const stages = Object.fromEntries(
    recipe.timeline.map((stage) => [stage.name, stageProgress(stage, progress)])
  );
  const active = recipe.timeline.filter((stage) => stages[stage.name] > 0).map((stage) => stage.name);
  return { progress, stages, active, complete: progress >= 1 };
}

function qualityThresholds(sample) {
  const s = sample.stages || {};
  return {
    semanticDetail: s.architecture >= 0.55 ? 0.62 : 0,
    materialRichness: s.materials >= 0.50 ? 0.58 : 0,
    lightingResponse: s.lighting >= 0.55 ? 0.55 : 0,
    lifeMotion: s.life >= 0.45 ? 0.45 : 0,
    depthComposition: s.final >= 0.25 ? 0.58 : 0
  };
}

function evaluateEvolutionQuality(sample, metrics = {}) {
  const thresholds = qualityThresholds(sample);
  const pairs = [
    ['SEMANTIC_DETAIL_FAIL', 'semanticDetail'],
    ['MATERIAL_FAIL', 'materialRichness'],
    ['LIGHTING_FAIL', 'lightingResponse'],
    ['CHARACTER_QUALITY_FAIL', 'lifeMotion'],
    ['ENVIRONMENT_COMPOSITION_FAIL', 'depthComposition']
  ];
  const failures = [];
  for (const [code, key] of pairs) {
    const required = thresholds[key];
    if (required > 0 && clamp01(metrics[key]) < required) failures.push(code);
  }
  return { pass: failures.length === 0, failures, thresholds };
}

function containsPrebuiltScenePayload(value) {
  if (!value || typeof value !== 'object') return false;
  const forbidden = /(^|\.|_)(vertices|indices|mesh|meshes|voxels|positions|transforms|prebuiltScene)$/i;
  for (const [key, child] of Object.entries(value)) {
    if (forbidden.test(key) && Array.isArray(child) && child.length > 0) return true;
    if (containsPrebuiltScenePayload(child)) return true;
  }
  return false;
}

module.exports = {
  DEFAULT_STAGES,
  compileWorldEvolutionRecipe,
  sampleEvolution,
  evaluateEvolutionQuality,
  containsPrebuiltScenePayload,
  cleanSeed
};
