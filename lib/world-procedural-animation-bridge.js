'use strict';

const core = require('../shared/world-procedural-core');

function buildFrameTimeline(recipeInput = {}, options = {}) {
  const recipe = core.normalizeRecipe(recipeInput);
  const duration = Math.max(2, Math.min(120, Number(options.durationSeconds) || 12));
  const motion = recipe.animation.enabled ? recipe.animation.ambientMotion : 0;
  const wind = recipe.atmosphere.wind;
  const seed = recipe.seed ^ 0x4cf5ad43;
  const random = core.mulberry32(seed);
  const tracks = [];
  if (motion > 0) {
    tracks.push({ id: 'ambient-breathe', target: 'world', property: 'ambientPulse', loop: true, keyframes: [
      { t: 0, value: 0 }, { t: duration * 0.5, value: +(0.015 + motion * 0.08).toFixed(4) }, { t: duration, value: 0 }
    ] });
  }
  if (wind > 0) {
    tracks.push({ id: 'wind-sway', target: 'environment', property: 'sway', loop: true, phase: +random().toFixed(4), keyframes: [
      { t: 0, value: -wind }, { t: duration * 0.5, value: wind }, { t: duration, value: -wind }
    ] });
  }
  return { engine: 'world-procedural-frame-timeline-v1', seed, duration, enabled: recipe.animation.frameTimeline && recipe.animation.enabled, tracks };
}

function installIntoTimelineRuntime(runtime, timeline) {
  if (!timeline?.enabled) return { installed: 0, mode: 'disabled' };
  if (runtime && typeof runtime.registerTrack === 'function') {
    for (const track of timeline.tracks) runtime.registerTrack(track);
    return { installed: timeline.tracks.length, mode: 'registerTrack' };
  }
  if (runtime && typeof runtime.setTimeline === 'function') {
    runtime.setTimeline(timeline);
    return { installed: timeline.tracks.length, mode: 'setTimeline' };
  }
  return { installed: 0, mode: 'adapter-required', timeline };
}

module.exports = { buildFrameTimeline, installIntoTimelineRuntime };
