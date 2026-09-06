'use strict';

const core = require('../shared/world-procedural-core');

function flattenPaths(value, prefix = '', out = []) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    if (prefix) out.push(prefix);
    return out;
  }
  const keys = Object.keys(value);
  if (!keys.length && prefix) out.push(prefix);
  for (const key of keys) flattenPaths(value[key], prefix ? `${prefix}.${key}` : key, out);
  return out;
}

function invalidationClassesFromDelta(delta = {}) {
  const paths = flattenPaths(delta);
  const classes = new Set();
  for (const path of paths) {
    if (path === 'seed' || path.startsWith('terrain.') || path.startsWith('architecture.')) {
      classes.add('geometry');
      classes.add('mesh');
      classes.add('visibility');
    }
    if (path.startsWith('style.')) {
      if (/voxelScale|pixelScale|detail/.test(path)) {
        classes.add('geometry');
        classes.add('mesh');
      }
      classes.add('material');
      classes.add('shader');
    }
    if (path.startsWith('atmosphere.')) {
      classes.add('atmosphere');
      classes.add('shader');
      classes.add('visibility');
      classes.add('audio');
    }
    if (path.startsWith('animation.')) classes.add('animation');
    if (path.startsWith('audio.')) classes.add('audio');
    if (path.startsWith('performance.')) {
      classes.add('budget');
      classes.add('visibility');
    }
  }
  return { paths, classes: [...classes].sort() };
}

function chunkKey(x, z) { return `${Math.trunc(x)},${Math.trunc(z)}`; }

class IncrementalChunkDag {
  constructor() {
    this.nodes = new Map();
  }

  ensureChunk(x, z) {
    const key = chunkKey(x, z);
    if (!this.nodes.has(key)) {
      this.nodes.set(key, {
        key,
        x: Math.trunc(x),
        z: Math.trunc(z),
        versions: { geometry: 0, mesh: 0, material: 0, shader: 0, visibility: 0, atmosphere: 0, animation: 0, audio: 0, budget: 0 },
        dirty: new Set()
      });
    }
    return this.nodes.get(key);
  }

  registerChunks(coords = []) {
    return coords.map((pair) => this.ensureChunk(pair?.[0] || 0, pair?.[1] || 0));
  }

  invalidateClasses(classes = [], predicate = null) {
    const affected = [];
    for (const node of this.nodes.values()) {
      if (predicate && !predicate(node)) continue;
      for (const cls of classes) node.dirty.add(cls);
      if (classes.length) affected.push(node.key);
    }
    return affected;
  }

  invalidateRecipeChange(previousRecipe, nextRecipe, options = {}) {
    const previous = core.normalizeRecipe(previousRecipe || {});
    const next = core.normalizeRecipe(nextRecipe || {});
    const delta = core.diffObject(previous, next) || {};
    const classification = invalidationClassesFromDelta(delta);
    const radius = Number.isFinite(Number(options.localRadius)) ? Math.max(0, Math.trunc(options.localRadius)) : null;
    const center = options.center || null;
    const predicate = radius == null || !center ? null : (node) => Math.max(Math.abs(node.x - center.x), Math.abs(node.z - center.z)) <= radius;
    const affectedChunks = this.invalidateClasses(classification.classes, predicate);
    return { delta, ...classification, affectedChunks };
  }

  markBuilt(x, z, classes = []) {
    const node = this.ensureChunk(x, z);
    const built = classes.length ? classes : [...node.dirty];
    for (const cls of built) {
      if (Object.hasOwn(node.versions, cls)) node.versions[cls] += 1;
      node.dirty.delete(cls);
    }
    return this.snapshotNode(node.key);
  }

  dirtyChunks(cls = null) {
    return [...this.nodes.values()]
      .filter((node) => cls ? node.dirty.has(cls) : node.dirty.size > 0)
      .map((node) => ({ key: node.key, x: node.x, z: node.z, dirty: [...node.dirty].sort() }));
  }

  snapshotNode(key) {
    const node = this.nodes.get(String(key));
    if (!node) return null;
    return { key: node.key, x: node.x, z: node.z, versions: { ...node.versions }, dirty: [...node.dirty].sort() };
  }
}

module.exports = { flattenPaths, invalidationClassesFromDelta, chunkKey, IncrementalChunkDag };
