'use strict';

const {
  MATERIALS, NEIGHBORS_2D, NEIGHBORS_3D, key, parseKey, hash32
} = require('./world-matter-engine');

function numericPositionSort(a, b) {
  const ap = typeof a === 'string' ? parseKey(a) : a;
  const bp = typeof b === 'string' ? parseKey(b) : b;
  return ap[1] - bp[1] || ap[0] - bp[0] || ap[2] - bp[2];
}

function defaultStructural(cell) {
  return Boolean(cell && MATERIALS[cell.material]?.phase === 'solid');
}

function boundsFor(positions) {
  const out = {
    min: { x: Infinity, y: Infinity, z: Infinity },
    max: { x: -Infinity, y: -Infinity, z: -Infinity }
  };
  for (const [x, y, z] of positions) {
    out.min.x = Math.min(out.min.x, x); out.max.x = Math.max(out.max.x, x);
    out.min.y = Math.min(out.min.y, y); out.max.y = Math.max(out.max.y, y);
    out.min.z = Math.min(out.min.z, z); out.max.z = Math.max(out.max.z, z);
  }
  if (!positions.length) {
    out.min = { x: 0, y: 0, z: 0 };
    out.max = { x: 0, y: 0, z: 0 };
  }
  return out;
}

class WorldStructureEngine {
  constructor({
    world,
    mode = 'voxel3d',
    groundY = 0,
    maxCells = 100000,
    isStructural = defaultStructural,
    isAnchor = null,
    eventSink = null
  } = {}) {
    if (!world) throw new Error('WorldStructureEngine requires a MatterWorld');
    this.world = world;
    this.mode = mode === 'pixel2d' ? 'pixel2d' : 'voxel3d';
    this.groundY = Number.isFinite(groundY) ? groundY : 0;
    this.maxCells = Math.max(1, Math.floor(maxCells));
    this.isStructural = typeof isStructural === 'function' ? isStructural : defaultStructural;
    this.isAnchor = typeof isAnchor === 'function' ? isAnchor : null;
    this.eventSink = typeof eventSink === 'function' ? eventSink : null;
    this.anchors = new Set();
  }

  addAnchor(x, y, z = 0) {
    if (this.mode === 'pixel2d') z = 0;
    this.anchors.add(key(x, y, z));
  }

  removeAnchor(x, y, z = 0) {
    if (this.mode === 'pixel2d') z = 0;
    this.anchors.delete(key(x, y, z));
  }

  clearAnchors() { this.anchors.clear(); }

  analyze({ maxCells = this.maxCells } = {}) {
    const limit = Math.max(1, Math.floor(maxCells));
    const structural = new Map();
    this.world.forEachCell((cell, x, y, z) => {
      if (this.mode === 'pixel2d' && z !== 0) return;
      if (this.isStructural(cell, x, y, z)) structural.set(key(x, y, z), cell);
    });
    if (structural.size > limit) {
      return {
        complete: false, reason: 'structural-cell-budget-exceeded',
        structuralCells: structural.size, maxCells: limit,
        supportedCells: 0, unsupportedCells: 0, components: []
      };
    }
    const offsets = this.mode === 'pixel2d' ? NEIGHBORS_2D : NEIGHBORS_3D;
    const supported = new Set(), queue = [];
    const keys = Array.from(structural.keys()).sort(numericPositionSort);
    for (const position of keys) {
      const [x, y, z] = parseKey(position);
      const cell = structural.get(position);
      const anchored = this.anchors.has(position) || y <= this.groundY ||
        Boolean(this.isAnchor?.(cell, x, y, z));
      if (!anchored) continue;
      supported.add(position);
      queue.push(position);
    }
    for (let cursor = 0; cursor < queue.length; cursor++) {
      const position = queue[cursor];
      const [x, y, z] = parseKey(position);
      for (const [dx, dy, dz] of offsets) {
        const neighbor = key(x + dx, y + dy, z + dz);
        if (!structural.has(neighbor) || supported.has(neighbor)) continue;
        supported.add(neighbor);
        queue.push(neighbor);
      }
    }
    const unsupportedKeys = keys.filter(position => !supported.has(position));
    const unsupported = new Set(unsupportedKeys);
    const components = [];
    for (const first of unsupportedKeys) {
      if (!unsupported.has(first)) continue;
      const componentKeys = [], componentQueue = [first];
      unsupported.delete(first);
      for (let cursor = 0; cursor < componentQueue.length; cursor++) {
        const position = componentQueue[cursor];
        componentKeys.push(position);
        const [x, y, z] = parseKey(position);
        for (const [dx, dy, dz] of offsets) {
          const neighbor = key(x + dx, y + dy, z + dz);
          if (!unsupported.has(neighbor)) continue;
          unsupported.delete(neighbor);
          componentQueue.push(neighbor);
        }
      }
      componentKeys.sort(numericPositionSort);
      components.push(this._describeComponent(componentKeys, structural));
    }
    components.sort((a, b) => a.firstPosition.localeCompare(b.firstPosition));
    return {
      complete: true, mode: this.mode, structuralCells: structural.size,
      supportedCells: supported.size,
      unsupportedCells: components.reduce((sum, item) => sum + item.cellCount, 0),
      components
    };
  }

  detachUnsupported({ maxCells = this.maxCells, minClusterCells = 1 } = {}) {
    const analysis = this.analyze({ maxCells });
    if (!analysis.complete) return { ...analysis, detached: [] };
    const detached = [];
    for (const component of analysis.components) {
      if (component.cellCount < minClusterCells) continue;
      const clusterCells = [];
      for (const position of component.positions) {
        const [x, y, z] = parseKey(position);
        const cell = this.world.getCell(x, y, z);
        if (!cell || !this.isStructural(cell, x, y, z)) continue;
        clusterCells.push({ x, y, z, cell });
      }
      if (!clusterCells.length) continue;
      for (const item of clusterCells) this.world.setCell(item.x, item.y, item.z, 'air');
      const cluster = this._clusterFromCells(component.id, clusterCells);
      detached.push(cluster);
      this._emit('cluster-detached', {
        clusterId: cluster.id, cellCount: cluster.cellCount,
        mass: cluster.mass, center: cluster.center
      });
    }
    return { ...analysis, detached };
  }

  _describeComponent(componentKeys, structural) {
    const positions = componentKeys.map(parseKey);
    const bounds = boundsFor(positions);
    let mass = 0, strength = 0;
    for (const position of componentKeys) {
      const cell = structural.get(position), def = MATERIALS[cell.material] || {};
      mass += Number(def.density || 1);
      strength += Number(cell.integrity ?? def.strength ?? 0);
    }
    const center = positions.reduce((acc, [x, y, z]) => ({
      x: acc.x + x, y: acc.y + y, z: acc.z + z
    }), { x: 0, y: 0, z: 0 });
    center.x /= positions.length; center.y /= positions.length; center.z /= positions.length;
    const idSeed = `${this.world.seed}:${this.world.tick}:${componentKeys.join('|')}`;
    return {
      id: `cluster-${hash32(idSeed).toString(16)}`,
      firstPosition: componentKeys[0], positions: componentKeys,
      cellCount: componentKeys.length, mass, strength, center, bounds
    };
  }

  _clusterFromCells(id, cells) {
    const positions = cells.map(item => [item.x, item.y, item.z]);
    const bounds = boundsFor(positions), origin = { ...bounds.min };
    let mass = 0, strength = 0;
    const relativeCells = cells.map(item => {
      const def = MATERIALS[item.cell.material] || {};
      mass += Number(def.density || 1);
      strength += Number(item.cell.integrity ?? def.strength ?? 0);
      return {
        dx: item.x - origin.x, dy: item.y - origin.y, dz: item.z - origin.z,
        cell: { ...item.cell }
      };
    });
    const center = {
      x: cells.reduce((s, c) => s + c.x, 0) / cells.length,
      y: cells.reduce((s, c) => s + c.y, 0) / cells.length,
      z: cells.reduce((s, c) => s + c.z, 0) / cells.length
    };
    return {
      id, mode: this.mode, origin, center, cells: relativeCells,
      cellCount: relativeCells.length, mass, strength,
      velocity: { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      orientationQuarterTurns: 0, age: 0
    };
  }

  _emit(type, detail) { this.eventSink?.({ tick: this.world.tick, type, ...detail }); }
}

module.exports = { WorldStructureEngine, defaultStructural, numericPositionSort, boundsFor };
