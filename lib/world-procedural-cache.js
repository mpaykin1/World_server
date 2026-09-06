'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { stableStringify } = require('../shared/world-procedural-core');

class RecipeCache {
  constructor(options = {}) {
    this.maxEntries = Math.max(4, Math.min(4096, Math.trunc(Number(options.maxEntries) || 128)));
    this.maxBytes = Math.max(65536, Math.min(1024 * 1024 * 512, Math.trunc(Number(options.maxBytes) || 16 * 1024 * 1024)));
    this.map = new Map();
    this.bytes = 0;
  }

  _size(value) {
    return Buffer.byteLength(stableStringify(value), 'utf8');
  }

  _touch(key, entry) {
    this.map.delete(key);
    this.map.set(key, entry);
  }

  _evict() {
    while (this.map.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      const entry = this.map.get(oldest.value);
      this.bytes -= entry?.bytes || 0;
      this.map.delete(oldest.value);
    }
  }

  get(key) {
    const entry = this.map.get(String(key));
    if (!entry) return undefined;
    this._touch(String(key), entry);
    return entry.value;
  }

  set(key, value) {
    const id = String(key);
    const previous = this.map.get(id);
    if (previous) this.bytes -= previous.bytes;
    const bytes = this._size(value);
    const entry = { value, bytes };
    this.map.set(id, entry);
    this.bytes += bytes;
    this._touch(id, entry);
    this._evict();
    return value;
  }

  async getOrCreate(key, factory) {
    const cached = this.get(key);
    if (typeof cached !== 'undefined') return cached;
    const value = await factory();
    this.set(key, value);
    return value;
  }

  clear() {
    this.map.clear();
    this.bytes = 0;
  }
}

function encodeBrotli(value) {
  const source = Buffer.from(stableStringify(value), 'utf8');
  return zlib.brotliCompressSync(source, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 5 } });
}

function decodeBrotli(buffer) {
  return JSON.parse(zlib.brotliDecompressSync(buffer).toString('utf8'));
}

class FileRecipeCache {
  constructor(cacheDir) {
    if (!cacheDir) throw new TypeError('cacheDir required');
    this.cacheDir = path.resolve(cacheDir);
  }

  _path(key) {
    const id = String(key);
    if (!/^[a-f0-9]{16,64}$/i.test(id)) throw new Error('unsafe recipe cache key');
    return path.join(this.cacheDir, `${id.toLowerCase()}.json.br`);
  }

  get(key) {
    const file = this._path(key);
    if (!fs.existsSync(file)) return undefined;
    return decodeBrotli(fs.readFileSync(file));
  }

  set(key, value) {
    fs.mkdirSync(this.cacheDir, { recursive: true });
    const file = this._path(key);
    const temp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(temp, encodeBrotli(value));
    fs.renameSync(temp, file);
    return value;
  }
}

function createDefaultCache(options = {}) {
  const memory = new RecipeCache(options);
  const cacheDir = options.cacheDir || process.env.WORLD_RECIPE_CACHE_DIR || null;
  const file = cacheDir ? new FileRecipeCache(cacheDir) : null;
  return {
    get(key) {
      const fast = memory.get(key);
      if (typeof fast !== 'undefined') return fast;
      const persisted = file?.get(key);
      if (typeof persisted !== 'undefined') memory.set(key, persisted);
      return persisted;
    },
    set(key, value) {
      memory.set(key, value);
      if (file) file.set(key, value);
      return value;
    },
    async getOrCreate(key, factory) {
      const cached = this.get(key);
      if (typeof cached !== 'undefined') return cached;
      return this.set(key, await factory());
    },
    memory,
    file
  };
}

module.exports = { RecipeCache, FileRecipeCache, createDefaultCache, encodeBrotli, decodeBrotli };
