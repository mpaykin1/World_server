'use strict';

const crypto = require('crypto');
const core = require('../shared/world-procedural-core');
const { generateCandidates, paretoFront } = require('./world-procedural-tuner');

function sha256(value) { return crypto.createHash('sha256').update(core.stableStringify(value)).digest('hex'); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, Number(v))); }

function normalizeMetrics(metrics = {}, targetFps = 60) {
  const p95 = Math.max(0, Number(metrics.p95FrameMs ?? metrics.p95_frame_ms) || 0);
  const fps = Math.max(0, Number(metrics.fps) || (p95 > 0 ? 1000 / p95 : 0));
  const visual = clamp(metrics.visualScore ?? metrics.visual_score ?? metrics.visual ?? metrics.quality ?? 0, 0, 100);
  const animation = clamp(metrics.animationScore ?? metrics.animation_score ?? metrics.animation ?? visual, 0, 100);
  const stability = clamp(metrics.stabilityScore ?? metrics.stability_score ?? metrics.stability ?? 100 - (Number(metrics.jankRate ?? metrics.jank_rate) || 0) * 100, 0, 100);
  const bytes = Math.max(0, Number(metrics.bytes) || 0);
  const memoryMb = Math.max(0, Number(metrics.memoryMb ?? metrics.memory_mb) || 0);
  const target = Math.max(24, Number(targetFps) || 60);
  const fpsScore = clamp((fps / target) * 100, 0, 120);
  return { fps, p95FrameMs: p95, visual, animation, stability, bytes, memoryMb, fpsScore };
}

function scoreMetrics(metrics, options = {}) {
  const m = normalizeMetrics(metrics, options.targetFps);
  const sizePenalty = Math.min(15, Math.log2(1 + m.bytes / 1024) * 0.75);
  const memoryPenalty = Math.min(12, m.memoryMb / 512 * 4);
  const score = m.visual * 0.34 + m.animation * 0.12 + m.stability * 0.20 + Math.min(100, m.fpsScore) * 0.34 - sizePenalty - memoryPenalty;
  return { ...m, score: +clamp(score, 0, 100).toFixed(4) };
}

function promotionEligible(record = {}, options = {}) {
  const minScore = Number(options.minScore ?? 72);
  const m = scoreMetrics(record.metrics || record, options);
  return Boolean(
    record.verified === true &&
    record.regressionFree === true &&
    record.goldenVerified === true &&
    record.deviceCertified === true &&
    m.score >= minScore &&
    m.stability >= Number(options.minStability ?? 80) &&
    m.fps >= Number(options.minFps ?? Math.min(45, options.targetFps || 60))
  );
}

function selectPromotionCandidate(records = [], options = {}) {
  const ranked = records.map((r) => ({ ...r, normalized: scoreMetrics(r.metrics || r, options) }))
    .sort((a, b) => b.normalized.score - a.normalized.score || b.normalized.fps - a.normalized.fps || a.normalized.bytes - b.normalized.bytes);
  const winner = ranked.find((r) => promotionEligible({ ...r, metrics: r.normalized }, options)) || null;
  return { winner, ranked };
}

async function runTelemetryTournament(recipeInput, evaluator, options = {}) {
  if (typeof evaluator !== 'function') throw new TypeError('evaluator required');
  const base = core.normalizeRecipe(recipeInput);
  const candidates = [base, ...generateCandidates(base, { count: Math.max(1, (Number(options.count) || 12) - 1) })];
  const seen = new Set();
  const evaluated = [];
  for (const recipe of candidates) {
    const key = sha256(recipe);
    if (seen.has(key)) continue;
    seen.add(key);
    const rawMetrics = await evaluator(recipe);
    const normalized = scoreMetrics(rawMetrics, { targetFps: recipe.performance.targetFps, ...options });
    evaluated.push({ recipe, settingsHash: key, metrics: normalized });
  }
  const front = paretoFront(evaluated.map((r) => ({ ...r, metrics: { quality: r.metrics.score, fps: r.metrics.fps, bytes: r.metrics.bytes } })));
  const best = [...evaluated].sort((a, b) => b.metrics.score - a.metrics.score)[0] || null;
  return { engine: 'world-procedural-telemetry-tournament-v3', baseHash: sha256(base), evaluated, pareto: front, best };
}

function toLearningRecord(candidate, evidence = {}, options = {}) {
  if (!candidate?.recipe || !candidate?.metrics) throw new TypeError('candidate required');
  const metrics = candidate.metrics;
  return {
    scene: options.scene || `world:${candidate.recipe.worldId}`,
    device: evidence.device || evidence.deviceClass || 'unknown',
    deviceClass: evidence.deviceClass || evidence.device || 'unknown',
    score: metrics.score,
    settings: candidate.recipe,
    metrics,
    renderBackend: evidence.renderBackend || null,
    sceneFingerprint: evidence.sceneFingerprint || sha256({ worldId: candidate.recipe.worldId, seed: candidate.recipe.seed }),
    settingsHash: candidate.settingsHash || sha256(candidate.recipe),
    visualScore: metrics.visual,
    animationScore: metrics.animation,
    stabilityScore: metrics.stability,
    p50FrameMs: evidence.p50FrameMs ?? null,
    p95FrameMs: metrics.p95FrameMs || null,
    verified: evidence.verified === true,
    nativeCoveragePct: evidence.nativeCoveragePct ?? null,
    regressionFree: evidence.regressionFree === true,
    promotionState: promotionEligible({ metrics, ...evidence }, options) ? 'eligible' : 'candidate',
    styleProfile: candidate.recipe.style,
    baselineId: evidence.baselineId || null,
    goldenVerified: evidence.goldenVerified === true,
    deviceCertified: evidence.deviceCertified === true,
    source: 'world-procedural-v3-tournament'
  };
}

async function persistTournament(adapter, tournament, evidence = {}, options = {}) {
  if (!adapter?.recordLearning) throw new TypeError('live Supabase adapter with recordLearning required');
  const ids = [];
  for (const candidate of tournament.evaluated || []) ids.push(await adapter.recordLearning(toLearningRecord(candidate, evidence, options)));
  return ids;
}

module.exports = { normalizeMetrics, scoreMetrics, promotionEligible, selectPromotionCandidate, runTelemetryTournament, toLearningRecord, persistTournament };
