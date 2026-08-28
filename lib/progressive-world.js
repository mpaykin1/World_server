'use strict';

const crypto = require('crypto');
const { deriveVoxelWorld } = require('./voxel-provisioning');

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function collectText(value, out = [], depth = 0) {
  if (depth > 5 || out.join(' ').length > 7000) return out;
  if (typeof value === 'string') {
    const s = value.trim();
    if (s) out.push(s.slice(0, 800));
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value.slice(0, 24)) collectText(item, out, depth + 1);
    return out;
  }
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value).slice(0, 40)) collectText(value[key], out, depth + 1);
  }
  return out;
}

function progression(step, totalSteps) {
  const total = Math.max(1, Math.min(64, Math.trunc(Number(totalSteps) || 1)));
  const index = Math.max(0, Math.min(total - 1, Math.trunc(Number(step) || 0)));
  return {
    step: index,
    totalSteps: total,
    detailStage: index + 1,
    detailProgress: Number(((index + 1) / total).toFixed(4))
  };
}

function answerDensity(answers) {
  const texts = collectText(answers || {});
  const chars = Array.isArray(answers?.chars) ? answers.chars.length : 0;
  const worlds = Array.isArray(answers?.worlds) ? answers.worlds.length : 0;
  const charsSens = Array.isArray(answers?.chars)
    ? answers.chars.reduce((n, x) => n + (Array.isArray(x?.sens) ? x.sens.length : 0), 0)
    : 0;
  const worldsSens = Array.isArray(answers?.worlds)
    ? answers.worlds.reduce((n, x) => n + (Array.isArray(x?.sens) ? x.sens.length : 0), 0)
    : 0;
  return {
    textFragments: texts.length,
    textChars: texts.reduce((n, x) => n + x.length, 0),
    entities: chars + worlds,
    sensations: charsSens + worldsSens + (Array.isArray(answers?.storySens) ? answers.storySens.length : 0)
  };
}

function buildProgressiveSpec({ answers = {}, step = 0, totalSteps = 31, journey = 'create', sourceTitle = '' } = {}) {
  const p = progression(step, totalSteps);
  const fragments = collectText(answers);
  const title = String(
    answers.story ||
    answers.worlds?.[0]?.name ||
    sourceTitle ||
    (journey === 'join' ? 'Новая ветка мира' : 'Мир в темноте')
  ).trim().slice(0, 100) || 'Мир в темноте';

  const density = answerDensity(answers);
  const sceneParts = [
    `Этап проявления мира: ${p.detailStage}/${p.totalSteps}.`,
    `Плотность ответа: ${density.textFragments} фрагментов, ${density.entities} сущностей, ${density.sensations} ощущений.`
  ];
  if (fragments.length) sceneParts.push(fragments.join(' · ').slice(0, 6500));
  else sceneParts.push('Темнота. Один глаз наблюдает. Вдалеке горит единственный огонёк.');

  return {
    title,
    mode: journey === 'join' ? 'Ветка общего мира' : 'Создание мира',
    scene: sceneParts.join('\n'),
    format: answers.format || '',
    characters: Array.isArray(answers.chars) ? answers.chars : [],
    worlds: Array.isArray(answers.worlds) ? answers.worlds : [],
    provenance: {
      progressivePreview: true,
      journey,
      step: p.step,
      totalSteps: p.totalSteps,
      density
    }
  };
}

function previewWorldId(identity, journey = 'create') {
  const kind = identity?.kind === 'user' ? 'u' : 'g';
  const raw = identity?.kind === 'user' ? identity?.userId : identity?.guestId;
  const stable = String(raw || 'anonymous');
  const suffix = crypto.createHash('sha256').update(`${kind}:${stable}:${journey}`).digest('hex').slice(0, 20);
  return `p-${suffix}`;
}

function deriveProgressiveVoxelWorld(spec, worldId, { step = 0, totalSteps = 31 } = {}) {
  const p = progression(step, totalSteps);
  const row = deriveVoxelWorld(spec, worldId);
  const base = row.settings;
  const reveal = 0.18 + p.detailProgress * 0.82;

  base.preview = true;
  base.detailStage = p.detailStage;
  base.detailProgress = p.detailProgress;
  base.treeDensity = Number(clamp((base.treeDensity || 1) * (0.28 + p.detailProgress * 0.72), 0.08, 1.6).toFixed(3));
  base.heightScale = Number(clamp((base.heightScale || 1) * (0.82 + p.detailProgress * 0.18), 0.52, 1.5).toFixed(3));
  base.fogNear = Math.max(7, Math.round((base.fogNear || 45) * (0.4 + p.detailProgress * 0.6)));
  base.fogFar = Math.max(base.fogNear + 18, Math.round((base.fogFar || 95) * reveal));
  base.generatorVersion = Math.max(Number(base.generatorVersion) || 2, 3);

  const revisionInput = JSON.stringify({
    id: worldId,
    step: p.step,
    settings: base,
    title: spec.title,
    scene: spec.scene
  });
  base.previewRevision = crypto.createHash('sha256').update(revisionInput).digest('hex').slice(0, 12);
  return row;
}

module.exports = {
  clamp,
  collectText,
  progression,
  answerDensity,
  buildProgressiveSpec,
  previewWorldId,
  deriveProgressiveVoxelWorld
};
