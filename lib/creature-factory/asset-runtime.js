'use strict';

const crypto = require('crypto');
const { getLodTier, getTierConfig, loadPolicy } = require('./lod');

const FORMATS = Object.freeze([
  'zero-signal-procedural-asset-v1',
  'zero-signal-godot-procedural-asset-v1'
]);

const CATEGORIES = Object.freeze([
  'reptile','croc_teeth','fish','dragon','dragon_fire',
  'human','human_sword','human_torch','human_gun',
  'ship','steampunk_vehicle','creature','monster'
]);

const MAX_SOURCE_BYTES = 8 * 1024 * 1024;

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  const keys = Object.keys(value).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

function sanitize(value, depth = 0) {
  if (depth > 6) return null;
  if (value == null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') return value.slice(0, 512);
  if (Array.isArray(value)) return value.slice(0, 64).map(v => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out = {};
    for (const key of Object.keys(value).sort().slice(0, 64)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') continue;
      const v = value[key];
      if (typeof v === 'function' || typeof v === 'undefined' || typeof v === 'symbol') continue;
      out[String(key).slice(0, 128)] = sanitize(v, depth + 1);
    }
    return out;
  }
  return null;
}

function validateFormat(asset) {
  if (!asset || typeof asset !== 'object' || Array.isArray(asset)) {
    return { ok: false, error: 'asset object required' };
  }
  if (!FORMATS.includes(asset.format)) {
    return { ok: false, error: `unsupported format: ${String(asset.format || 'missing')}` };
  }
  if (!CATEGORIES.includes(asset.category)) {
    return { ok: false, error: `unsupported category: ${String(asset.category || 'missing')}` };
  }
  return { ok: true, format: asset.format, category: asset.category };
}

function sourceMetadata(asset) {
  const source = Object.prototype.hasOwnProperty.call(asset, 'object') ? asset.object : asset.source;
  if (source == null) return { sourceHash: sha256('null'), sourceBytes: 0, hasSourceObject: false };
  let raw;
  try { raw = JSON.stringify(source); } catch (err) { throw new Error(`source payload is not serializable: ${err.message}`); }
  const bytes = Buffer.byteLength(raw, 'utf8');
  if (bytes > MAX_SOURCE_BYTES) throw new Error(`source payload exceeds ${MAX_SOURCE_BYTES} bytes`);
  return { sourceHash: sha256(raw), sourceBytes: bytes, hasSourceObject: true };
}

function buildRecipe(asset, options = {}) {
  const check = validateFormat(asset);
  if (!check.ok) throw new Error(check.error);
  const metadata = sourceMetadata(asset);
  const base = {
    schemaVersion: 'creature-recipe-v1',
    sourceFormat: asset.format,
    category: asset.category,
    name: String(asset.name || asset.params?.name || asset.category).slice(0, 128),
    params: sanitize(asset.params || {}),
    materialSettings: sanitize(asset.materialSettings || {}),
    controls: sanitize(asset.controls || {}),
    metadata
  };
  const baseHash = sha256(stableStringify(base));
  const explicitSeed = options.seed ?? asset.seed ?? asset.params?.seed;
  const seed = explicitSeed == null || explicitSeed === '' ? baseHash.slice(0, 16) : String(explicitSeed).slice(0, 128);
  const canonical = { ...base, seed };
  const hash = sha256(stableStringify(canonical));
  return Object.freeze({ ...canonical, hash });
}

function recipeHash(value) {
  if (value && value.schemaVersion === 'creature-recipe-v1') {
    const copy = { ...value };
    delete copy.hash;
    return sha256(stableStringify(copy));
  }
  return buildRecipe(value).hash;
}

function instancingKey(recipe, lod = 'full') {
  const hash = recipe && recipe.hash ? recipe.hash : recipeHash(recipe);
  return `creature:${String(lod)}:${hash}`;
}

class AnimationScheduler {
  constructor({ maxPerFrame = 32 } = {}) {
    this.maxPerFrame = Math.max(1, Math.floor(Number(maxPerFrame) || 1));
    this.cursor = 0;
    this.signature = '';
  }
  schedule(ids) {
    const list = Array.from(new Set((Array.isArray(ids) ? ids : []).map(String))).sort();
    if (!list.length) { this.cursor = 0; this.signature = ''; return []; }
    const sig = list.join('\u0000');
    if (sig !== this.signature) { this.signature = sig; this.cursor = 0; }
    if (this.cursor >= list.length) this.cursor = 0;
    const end = Math.min(list.length, this.cursor + this.maxPerFrame);
    const batch = list.slice(this.cursor, end);
    this.cursor = end >= list.length ? 0 : end;
    return batch;
  }
}

class LodHysteresis {
  constructor({ hysteresisFrames = 3 } = {}) {
    this.hysteresisFrames = Math.max(1, Math.floor(Number(hysteresisFrames) || 1));
    this.states = new Map();
  }
  record(id, requestedTier) {
    const key = String(id);
    const tier = String(requestedTier);
    let st = this.states.get(key);
    if (!st) {
      st = { current: tier, pending: null, count: 0 };
      this.states.set(key, st);
      return st.current;
    }
    if (tier === st.current) {
      st.pending = null; st.count = 0; return st.current;
    }
    if (st.pending === tier) st.count += 1;
    else { st.pending = tier; st.count = 1; }
    if (st.count >= this.hysteresisFrames) {
      st.current = tier; st.pending = null; st.count = 0;
    }
    return st.current;
  }
  current(id) { return this.states.get(String(id))?.current; }
}

const QUALITY_BY_TIER = Object.freeze({
  full:   { geometryScale: 1.00, animationHz: 60, shaderTier: 'high',   castShadow: true,  collisionTier: 'full',    useImpostor: false, sleep: false },
  high:   { geometryScale: 0.65, animationHz: 30, shaderTier: 'medium', castShadow: true,  collisionTier: 'reduced', useImpostor: false, sleep: false },
  medium: { geometryScale: 0.35, animationHz: 10, shaderTier: 'low',    castShadow: false, collisionTier: 'bbox',    useImpostor: false, sleep: false },
  low:    { geometryScale: 0.08, animationHz: 0,  shaderTier: 'minimal',castShadow: false, collisionTier: 'none',    useImpostor: true,  sleep: true }
});

function planCreatureQuality(ctx = {}, policyOverride) {
  const policy = loadPolicy(policyOverride);
  const order = policy.tierOrder || ['full','high','medium','low'];
  if (ctx.visible === false) return { tier: 'low', ...QUALITY_BY_TIER.low, reason: 'not-visible' };
  let rank = Math.max(0, order.indexOf(getLodTier(Number(ctx.distance) || 0, policy)));
  const targetFps = Math.max(1, Number(ctx.targetFps) || 60);
  const targetMs = 1000 / targetFps;
  if (ctx.mobile) rank += 1;
  if ((Number(ctx.cpuPressure) || 0) >= 0.75) rank += 1;
  if ((Number(ctx.frameTimeMs) || 0) > targetMs * 1.25) rank += 1;
  if (Number.isFinite(Number(ctx.projectedSize)) && Number(ctx.projectedSize) < 0.015) rank += 1;
  rank = Math.min(order.length - 1, rank);
  const tier = order[rank] || 'low';
  const base = QUALITY_BY_TIER[tier] || QUALITY_BY_TIER.low;
  const cfg = getTierConfig(tier, policy) || {};
  return { tier, ...base, animationHz: cfg.tickRate > 0 ? Math.min(base.animationHz, Math.max(1, Math.round(cfg.tickRate * 60))) : 0, reason: 'distance-budget' };
}

module.exports = {
  FORMATS,
  CATEGORIES,
  MAX_SOURCE_BYTES,
  stableStringify,
  validateFormat,
  buildRecipe,
  recipeHash,
  instancingKey,
  AnimationScheduler,
  LodHysteresis,
  planCreatureQuality
};
