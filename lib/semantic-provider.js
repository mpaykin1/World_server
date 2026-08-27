'use strict';

// Semantic Provider Interface: the one seam between the deterministic World
// Spec generator (always on, free, this repo's mandatory baseline per
// AGENTS.md's dual-layer rule) and an optional real AI/semantic-
// interpretation worker, so a heavier engine can be plugged in later as a
// separate service -- the exact same shape this repo already uses for AI3D
// (see lib/ai3d-discovery.js / AI3D_WORKER_URL: a discovered/configured
// external worker the API calls over HTTP, never bundled into the Vercel
// Function itself) -- WITHOUT touching story.js/world.js/merge.js or the
// questionnaire pipeline again when that worker is actually built.
//
// Pipeline this implements:
//   questionnaire -> semantic interpretation (worker, when configured)
//                 -> World Spec -> existing voxel/world runtime
//   questionnaire -> deterministic World Spec (always)
//                 -> existing voxel/world runtime
//
// A worker that is unconfigured, unreachable, slow, or returns a malformed
// result always falls back to the deterministic path rather than failing
// the request -- the questionnaire must never break because an optional
// layer is unavailable. No paid API is called by default; SEMANTIC_AI_
// WORKER_URL is opt-in and unset today (see WORK_IN_PROGRESS.md for why a
// local LLM isn't bundled directly into this Vercel deployment).

const { buildBlueprint } = require('./narrative-blueprint');
const { buildWorldSpec } = require('./world-spec');

const WORKER_URL_ENV = 'SEMANTIC_AI_WORKER_URL';
const WORKER_TIMEOUT_MS_ENV = 'SEMANTIC_AI_WORKER_TIMEOUT_MS';
const DEFAULT_TIMEOUT_MS = 4000;

function workerUrl() {
  return process.env[WORKER_URL_ENV] || '';
}

function workerConfigured() {
  return Boolean(workerUrl());
}

function workerTimeoutMs() {
  return Number(process.env[WORKER_TIMEOUT_MS_ENV]) || DEFAULT_TIMEOUT_MS;
}

async function callWorker(path, payload) {
  const base = workerUrl();
  if (!base) return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), workerTimeoutMs());
  try {
    const res = await fetch(`${base}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    // Network error, timeout, worker down, malformed response -- all treated
    // identically: fall back, never surface as a failure to the caller.
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {object} answers
 * @param {{journey?: string, sourceTitle?: string}} context
 * @returns {Promise<{blueprint: {title:string,mode:string,scene:string}, provider: 'ai'|'deterministic'}>}
 */
async function interpretBlueprint(answers, context = {}) {
  const aiResult = await callWorker('/blueprint', { answers, context });
  if (aiResult && typeof aiResult.title === 'string' && typeof aiResult.scene === 'string') {
    return { blueprint: { title: aiResult.title, mode: String(aiResult.mode || ''), scene: aiResult.scene }, provider: 'ai' };
  }
  return { blueprint: buildBlueprint(answers, context), provider: 'deterministic' };
}

/**
 * @param {{id?: string, answers: object, blueprint: object}} story
 * @returns {Promise<{spec: object, provider: 'ai'|'deterministic'}>}
 */
async function interpretWorldSpec(story) {
  const aiResult = await callWorker('/world-spec', { story });
  if (aiResult && aiResult.spec && typeof aiResult.spec === 'object') {
    return { spec: aiResult.spec, provider: 'ai' };
  }
  return { spec: buildWorldSpec(story), provider: 'deterministic' };
}

module.exports = { interpretBlueprint, interpretWorldSpec, workerConfigured, workerUrl, WORKER_URL_ENV, WORKER_TIMEOUT_MS_ENV };
