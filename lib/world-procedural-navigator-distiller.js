'use strict';

const core = require('../shared/world-procedural-core');
const { navigatorMutation } = require('./world-procedural-recipe-engine');

const ALLOWED_ROOTS = new Set(['style', 'terrain', 'architecture', 'atmosphere', 'animation', 'audio', 'performance', 'seed']);

function validateRecipePatch(patch = {}) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new TypeError('recipePatch must be an object');
  const out = {};
  for (const key of Object.keys(patch)) {
    if (!ALLOWED_ROOTS.has(key)) continue;
    out[key] = core.stableClone(patch[key]);
  }
  return out;
}

function semanticPatch(semantics = {}) {
  const patch = {};
  if (semantics.environment) patch.terrain = { kind: String(semantics.environment).slice(0, 32) };
  if (semantics.architecture) patch.architecture = { kind: String(semantics.architecture).slice(0, 40), density: semantics.architectureDensity };
  if (semantics.detail != null) patch.style = { ...(patch.style || {}), detail: semantics.detail };
  if (semantics.pixelScale != null) patch.style = { ...(patch.style || {}), pixelScale: semantics.pixelScale, voxelScale: semantics.pixelScale };
  if (semantics.wetness != null) patch.style = { ...(patch.style || {}), wetness: semantics.wetness };
  if (semantics.fog != null || semantics.darkness != null || semantics.weather) patch.atmosphere = { fog: semantics.fog, darkness: semantics.darkness, weather: semantics.weather };
  if (semantics.motion != null) patch.animation = { ambientMotion: semantics.motion, enabled: semantics.motion > 0 };
  if (semantics.ambience || semantics.audioIntensity != null) patch.audio = { ambience: semantics.ambience, intensity: semantics.audioIntensity };
  return validateRecipePatch(patch);
}

function heuristicPatchFromMessage(message = '') {
  const text = String(message).toLowerCase().slice(0, 4096);
  const patch = {};
  const style = {}, atmosphere = {}, architecture = {}, terrain = {}, audio = {};
  if (/город|city|улиц|street/.test(text)) { architecture.kind = 'city'; architecture.density = 0.6; }
  if (/готич|готик|gothic/.test(text)) { architecture.kind = 'gothic'; architecture.verticality = 0.82; }
  if (/руин|ruin/.test(text)) { architecture.kind = architecture.kind || 'ruins'; architecture.ruin = 0.62; }
  if (/башн|tower/.test(text)) { architecture.kind = 'tower'; architecture.verticality = 0.92; }
  if (/лес|forest/.test(text)) terrain.kind = 'forest';
  if (/пустын|desert/.test(text)) terrain.kind = 'desert';
  if (/туман|fog/.test(text)) atmosphere.fog = 0.82;
  if (/темн|dark|ноч|night/.test(text)) atmosphere.darkness = 0.82;
  if (/дожд|rain/.test(text)) { atmosphere.weather = 'rain'; style.wetness = 0.88; }
  if (/мокр|wet/.test(text)) style.wetness = 0.78;
  if (/детал|detail/.test(text)) style.detail = 0.92;
  if (/крупн.*пиксел|larger pixels|low detail/.test(text)) { style.pixelScale = 1.8; style.voxelScale = 1.8; style.detail = 0.48; }
  if (/мелк.*пиксел|smaller pixels|more detail/.test(text)) { style.pixelScale = 0.65; style.voxelScale = 0.65; style.detail = 0.95; }
  if (/тиш|quiet|calm/.test(text)) audio.intensity = 0.12;
  if (/гром|intense|tense/.test(text)) audio.intensity = 0.72;
  if (Object.keys(style).length) patch.style = style;
  if (Object.keys(atmosphere).length) patch.atmosphere = atmosphere;
  if (Object.keys(architecture).length) patch.architecture = architecture;
  if (Object.keys(terrain).length) patch.terrain = terrain;
  if (Object.keys(audio).length) patch.audio = audio;
  return validateRecipePatch(patch);
}

function distillNavigatorOutput(output = {}) {
  if (output.recipePatch && typeof output.recipePatch === 'object') return validateRecipePatch(output.recipePatch);
  if (output.semantics && typeof output.semantics === 'object') return semanticPatch(output.semantics);
  return heuristicPatchFromMessage(output.message || '');
}

function mutateFromNavigator(previousRecipe, output = {}, capabilities = {}, qualityScale = 1) {
  return navigatorMutation(previousRecipe, { message: output.message, recipePatch: distillNavigatorOutput(output) }, capabilities, qualityScale);
}

module.exports = { validateRecipePatch, semanticPatch, heuristicPatchFromMessage, distillNavigatorOutput, mutateFromNavigator };
