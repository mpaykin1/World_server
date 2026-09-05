'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const core = require('../shared/world-procedural-core');

const SAFE_DEFINE = /^[A-Z][A-Z0-9_]{0,63}$/;
function sha256(text) { return crypto.createHash('sha256').update(String(text)).digest('hex'); }

function normalizeFeatures(features = {}) {
  const out = {};
  for (const key of Object.keys(features).sort()) {
    const define = String(key).toUpperCase().replace(/[^A-Z0-9_]/g, '_');
    if (!SAFE_DEFINE.test(define)) continue;
    const value = features[key];
    if (typeof value === 'boolean') out[define] = value ? 1 : 0;
    else if (Number.isFinite(Number(value))) out[define] = Number(value);
    else out[define] = String(value).slice(0, 64);
  }
  return out;
}

function permutationKey(shaderId, features = {}) {
  return sha256(core.stableStringify({ shaderId: String(shaderId || 'world'), features: normalizeFeatures(features) }));
}

function compileShaderPermutation(template, options = {}) {
  const features = normalizeFeatures(options.features || {});
  const defines = Object.entries(features).map(([key, value]) => `#define ${key} ${typeof value === 'string' ? JSON.stringify(value) : value}`).join('\n');
  const marker = '/*__WORLD_DEFINES__*/';
  const source = String(template).includes(marker) ? String(template).replace(marker, defines) : `${defines}\n${String(template)}`;
  const key = permutationKey(options.shaderId || 'world', features);
  return { key, shaderId: String(options.shaderId || 'world'), features, source, bytes: Buffer.byteLength(source, 'utf8') };
}

class ShaderPermutationCache {
  constructor(options = {}) {
    this.map = new Map();
    this.cacheDir = options.cacheDir ? path.resolve(options.cacheDir) : null;
  }
  get(key) {
    const id = String(key);
    if (this.map.has(id)) return this.map.get(id);
    if (!this.cacheDir) return undefined;
    const file = path.join(this.cacheDir, `${id}.json`);
    if (!fs.existsSync(file)) return undefined;
    const value = JSON.parse(fs.readFileSync(file, 'utf8'));
    this.map.set(id, value);
    return value;
  }
  set(compiled) {
    if (!compiled?.key) throw new TypeError('compiled shader permutation required');
    this.map.set(compiled.key, compiled);
    if (this.cacheDir) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
      const file = path.join(this.cacheDir, `${compiled.key}.json`);
      fs.writeFileSync(file, `${JSON.stringify(compiled)}\n`);
    }
    return compiled;
  }
  getOrCompile(template, options = {}) {
    const key = permutationKey(options.shaderId || 'world', options.features || {});
    return this.get(key) || this.set(compileShaderPermutation(template, options));
  }
}

module.exports = { normalizeFeatures, permutationKey, compileShaderPermutation, ShaderPermutationCache };
