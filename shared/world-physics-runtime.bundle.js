(function(global){
'use strict';
const modules=Object.create(null),cache=Object.create(null);
modules["world-matter-engine"]=function(module,exports,require){
'use strict';

const CHUNK_SIZE = 16;
const AMBIENT_TEMPERATURE = 20;
const GRAVITY = Object.freeze({ x: 0, y: -1, z: 0 });
const NEIGHBORS_3D = Object.freeze([
  [0, 1, 0], [0, -1, 0], [1, 0, 0],
  [-1, 0, 0], [0, 0, 1], [0, 0, -1]
]);
const NEIGHBORS_2D = Object.freeze([
  [0, 1, 0], [0, -1, 0], [1, 0, 0], [-1, 0, 0]
]);
const NEIGHBORS = NEIGHBORS_3D;

const MATERIALS = Object.freeze({
  stone: { phase: 'solid', density: 2.7, conductivity: 0.08, strength: 12 },
  metal: { phase: 'solid', density: 7.8, conductivity: 0.22, strength: 20 },
  glass: { phase: 'solid', density: 2.5, conductivity: 0.09, strength: 3, brittle: true },
  coal: { phase: 'solid', density: 1.3, conductivity: 0.08, ignition: 420, fuel: 18, strength: 4 },
  dirt: { phase: 'powder', density: 1.45, conductivity: 0.05, strength: 1 },
  snow: { phase: 'powder', density: 0.35, conductivity: 0.06, strength: 0.2 },
  ash: { phase: 'powder', density: 0.45, conductivity: 0.04, strength: 0.3 },
  sand: { phase: 'powder', density: 1.6, conductivity: 0.05, strength: 0.4 },
  water: { phase: 'liquid', density: 1, conductivity: 0.15, boil: 100 },
  oil: { phase: 'liquid', density: 0.82, conductivity: 0.07, ignition: 220, fuel: 5 },
  wood: { phase: 'solid', density: 0.7, conductivity: 0.04, ignition: 300, fuel: 8, strength: 5 },
  steam: { phase: 'gas', density: 0.02, conductivity: 0.03, condense: 82 },
  fire: { phase: 'gas', density: 0.01, conductivity: 0.02, temperature: 700, life: 4 },
  lava: { phase: 'liquid', density: 3.1, conductivity: 0.18, temperature: 1050 }
});

function key(x, y, z) { return `${x},${y},${z}`; }
function parseKey(value) { return value.split(',').map(Number); }
function chunkKey(x, y, z) {
  return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
}
function cloneCell(cell) { return cell ? { ...cell } : null; }
function hash32(value) {
  let h = 2166136261;
  for (const char of String(value)) {
    h ^= char.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function horizontalDirections(seed, tick, x, y, z, dimensions = 3) {
  const dirs = dimensions === 2 ? [[1,0],[-1,0]] : [[1,0],[-1,0],[0,1],[0,-1]];
  const offset = hash32(`${seed}:${tick}:${x}:${y}:${z}`) % dirs.length;
  return dirs.slice(offset).concat(dirs.slice(0, offset));
}
function normalizeCell(material, state = {}) {
  const def = MATERIALS[material];
  if (!def) throw new Error(`Unknown matter material: ${material}`);
  return {
    material,
    temperature: Number.isFinite(state.temperature) ? state.temperature : (def.temperature ?? AMBIENT_TEMPERATURE),
    burning: Boolean(def.ignition && state.burning),
    fuel: Number.isFinite(state.fuel) ? state.fuel : (def.fuel ?? 0),
    life: Number.isFinite(state.life) ? state.life : (def.life ?? 0),
    integrity: Number.isFinite(state.integrity) ? Math.max(0, state.integrity) : (def.strength ?? 0)
  };
}

class MatterWorld {
  constructor({ seed = 1, dimensions = 3, eventSink = null, eventLimit = 10000 } = {}) {
    this.seed = seed;
    this.dimensions = dimensions === 2 ? 2 : 3;
    this.tick = 0;
    this.cells = new Map();
    this.activeCells = new Set();
    this.nextActive = null;
    this.eventSink = typeof eventSink === 'function' ? eventSink : null;
    this.eventLimit = Math.max(0, Math.floor(eventLimit));
    this.events = [];
  }

  getCell(x, y, z = 0) {
    return cloneCell(this.cells.get(key(x, y, this.dimensions === 2 ? 0 : z)));
  }

  hasCell(x, y, z = 0) {
    return this.cells.has(key(x, y, this.dimensions === 2 ? 0 : z));
  }

  setCell(x, y, z, material, state = {}) {
    if (this.dimensions === 2) z = 0;
    const k = key(x, y, z);
    const before = cloneCell(this.cells.get(k));
    if (!material || material === 'air') this.cells.delete(k);
    else this.cells.set(k, normalizeCell(material, state));
    const after = cloneCell(this.cells.get(k));
    this._wakeNeighborhood(x, y, z);
    if (before?.material !== after?.material) {
      this._emit(after ? 'cell-set' : 'cell-cleared', {
        position: { x, y, z }, before: before?.material || 'air', after: after?.material || 'air'
      });
    }
  }

  snapshot() {
    return Array.from(this.cells, ([position, cell]) => ({ position, ...cloneCell(cell) }))
      .sort((a, b) => a.position.localeCompare(b.position));
  }

  forEachCell(callback) {
    for (const [position, cell] of this.cells) {
      const [x, y, z] = parseKey(position);
      callback(cloneCell(cell), x, y, z);
    }
  }

  stats() {
    const chunks = new Set();
    for (const position of this.activeCells) {
      if (!this.cells.has(position)) continue;
      const [x, y, z] = parseKey(position);
      chunks.add(chunkKey(x, y, z));
    }
    return {
      tick: this.tick, dimensions: this.dimensions, cells: this.cells.size,
      activeCells: this.activeCells.size, activeChunks: chunks.size
    };
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  step({ maxCells = 50000 } = {}) {
    const queue = Array.from(this.activeCells).filter(position => this.cells.has(position));
    queue.sort((a, b) => hash32(`${this.seed}:${this.tick}:${a}`) - hash32(`${this.seed}:${this.tick}:${b}`));
    this.activeCells = new Set();
    this.nextActive = new Set();
    let processed = 0, changed = 0;
    for (const position of queue) {
      if (processed >= maxCells) { this.nextActive.add(position); continue; }
      const [x, y, z] = parseKey(position);
      if (!this.cells.has(position)) continue;
      processed++;
      if (this._processCell(x, y, z)) changed++;
    }
    this.activeCells = this.nextActive;
    this.nextActive = null;
    this.tick++;
    return { ...this.stats(), processed, changed };
  }

  _neighborOffsets() { return this.dimensions === 2 ? NEIGHBORS_2D : NEIGHBORS_3D; }
  _targetActive() { return this.nextActive || this.activeCells; }

  _emit(type, detail = {}) {
    const event = { tick: this.tick, type, ...detail };
    if (this.eventLimit > 0) {
      this.events.push(event);
      if (this.events.length > this.eventLimit) this.events.splice(0, this.events.length - this.eventLimit);
    }
    if (this.eventSink) this.eventSink(event);
  }

  _wakeNeighborhood(x, y, z) {
    const target = this._targetActive();
    target.add(key(x, y, z));
    for (const [dx, dy, dz] of this._neighborOffsets()) target.add(key(x + dx, y + dy, z + dz));
  }

  _replace(x, y, z, material, state = {}) {
    this.setCell(x, y, z, material, state);
    return true;
  }

  _move(x, y, z, nx, ny, nz) {
    if (this.dimensions === 2) nz = 0;
    const sourceKey = key(x, y, z), destKey = key(nx, ny, nz);
    const source = this.cells.get(sourceKey);
    if (!source || this.cells.has(destKey)) return false;
    this.cells.set(destKey, source);
    this.cells.delete(sourceKey);
    this._wakeNeighborhood(x, y, z);
    this._wakeNeighborhood(nx, ny, nz);
    this._emit('cell-move', { material: source.material, from: { x, y, z }, to: { x: nx, y: ny, z: nz } });
    return true;
  }

  _swap(x, y, z, nx, ny, nz) {
    if (this.dimensions === 2) nz = 0;
    const aKey = key(x, y, z), bKey = key(nx, ny, nz);
    const a = this.cells.get(aKey), b = this.cells.get(bKey);
    if (!a || !b) return false;
    this.cells.set(aKey, b);
    this.cells.set(bKey, a);
    this._wakeNeighborhood(x, y, z);
    this._wakeNeighborhood(nx, ny, nz);
    this._emit('cell-swap', {
      a: a.material, b: b.material,
      first: { x, y, z }, second: { x: nx, y: ny, z: nz }
    });
    return true;
  }

  _canDisplace(cell, target) {
    if (!target) return true;
    const a = MATERIALS[cell.material], b = MATERIALS[target.material];
    return ['powder','liquid'].includes(a.phase) && ['liquid','gas'].includes(b.phase) && a.density > b.density;
  }

  _tryMoveOrSwap(x, y, z, nx, ny, nz) {
    const cell = this.cells.get(key(x, y, z));
    const target = this.cells.get(key(nx, ny, this.dimensions === 2 ? 0 : nz));
    if (!cell) return false;
    if (!target) return this._move(x, y, z, nx, ny, nz);
    return this._canDisplace(cell, target) ? this._swap(x, y, z, nx, ny, nz) : false;
  }

  _adjacent(x, y, z) {
    return this._neighborOffsets().map(([dx,dy,dz]) => [x + dx, y + dy, z + dz]);
  }

  _tryLavaWater(x, y, z, cell) {
    if (cell.material !== 'lava') return false;
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const neighbor = this.cells.get(key(nx, ny, nz));
      if (neighbor?.material !== 'water') continue;
      this.setCell(x, y, z, 'stone', { temperature: 260 });
      this.setCell(nx, ny, nz, 'steam', { temperature: 140, life: 12 });
      this._emit('reaction', {
        reaction: 'lava-water', at: { x, y, z }, neighbor: { x: nx, y: ny, z: nz },
        products: ['stone', 'steam']
      });
      return true;
    }
    return false;
  }

  _phaseTransition(x, y, z, cell) {
    if (cell.material === 'water' && cell.temperature >= MATERIALS.water.boil) {
      this._emit('phase-change', { from: 'water', to: 'steam', at: { x, y, z } });
      return this._replace(x, y, z, 'steam', { temperature: cell.temperature, life: 12 });
    }
    if (cell.material === 'steam' && cell.temperature <= MATERIALS.steam.condense) {
      this._emit('phase-change', { from: 'steam', to: 'water', at: { x, y, z } });
      return this._replace(x, y, z, 'water', { temperature: cell.temperature });
    }
    return false;
  }

  _heatNeighbors(x, y, z, amount) {
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const neighborKey = key(nx, ny, nz);
      const neighbor = this.cells.get(neighborKey);
      if (!neighbor) continue;
      neighbor.temperature += amount * (MATERIALS[neighbor.material].conductivity || 0.03);
      this._wakeNeighborhood(nx, ny, nz);
    }
  }

  _combust(x, y, z, cell) {
    const def = MATERIALS[cell.material];
    if (!def.ignition) return false;
    const nearIgnition = this._adjacent(x, y, z).some(([nx,ny,nz]) => {
      const material = this.cells.get(key(nx,ny,nz))?.material;
      return material === 'fire' || material === 'lava';
    });
    if (!cell.burning && (cell.temperature >= def.ignition || nearIgnition)) {
      cell.burning = true;
      cell.temperature = Math.max(cell.temperature, def.ignition + 120);
      this._emit('ignition', { material: cell.material, at: { x, y, z } });
    }
    if (!cell.burning) return false;
    cell.fuel -= 1;
    cell.temperature = Math.max(cell.temperature, 500);
    this._heatNeighbors(x, y, z, 260);
    const aboveY = y - GRAVITY.y;
    if (!this.cells.has(key(x, aboveY, z))) this.setCell(x, aboveY, z, 'fire');
    this._wakeNeighborhood(x, y, z);
    if (cell.fuel > 0) return true;
    this._emit('burnout', { material: cell.material, at: { x, y, z } });
    if (cell.material === 'wood') this.setCell(x, y, z, 'ash', { temperature: 160 });
    else this.setCell(x, y, z, 'air');
    return true;
  }

  _processFire(x, y, z, fire) {
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const target = this.cells.get(key(nx, ny, nz));
      const targetDef = target && MATERIALS[target.material];
      if (targetDef?.ignition) {
        const wasBurning = target.burning;
        target.burning = true;
        target.temperature = Math.max(target.temperature, targetDef.ignition + 120);
        if (!wasBurning) this._emit('ignition', { material: target.material, at: { x: nx, y: ny, z: nz } });
        this._wakeNeighborhood(nx, ny, nz);
      }
    }
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const water = this.cells.get(key(nx, ny, nz));
      if (water?.material !== 'water') continue;
      water.temperature += 45;
      this.setCell(nx, ny, nz, 'water', water);
      this.setCell(x, y, z, 'air');
      this._emit('extinguished', { at: { x, y, z }, by: { x: nx, y: ny, z: nz } });
      return true;
    }
    this._heatNeighbors(x, y, z, 320);
    fire.life -= 1;
    if (fire.life <= 0) return this._replace(x, y, z, 'air');
    this._wakeNeighborhood(x, y, z);
    return this._moveMobile(x, y, z, fire);
  }

  _moveMobile(x, y, z, cell) {
    const phase = MATERIALS[cell.material].phase;
    const horizontal = horizontalDirections(this.seed, this.tick, x, y, z, this.dimensions);
    const downY = y + GRAVITY.y;
    const upY = y - GRAVITY.y;
    if (phase === 'powder') {
      if (this._tryMoveOrSwap(x, y, z, x, downY, z)) return true;
      for (const [dx,dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, downY, z + dz)) return true;
    }
    if (phase === 'liquid') {
      if (this._tryMoveOrSwap(x, y, z, x, downY, z)) return true;
      for (const [dx,dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, y, z + dz)) return true;
    }
    if (phase === 'gas') {
      if (this._tryMoveOrSwap(x, y, z, x, upY, z)) return true;
      for (const [dx,dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, y, z + dz)) return true;
    }
    return false;
  }

  _thermalStep(x, y, z, cell) {
    const def = MATERIALS[cell.material];
    if (Math.abs(cell.temperature - AMBIENT_TEMPERATURE) < 1) return false;
    const before = cell.temperature;
    cell.temperature += (AMBIENT_TEMPERATURE - cell.temperature) * (def.conductivity || 0.03) * 0.12;
    if (Math.abs(cell.temperature - before) < 0.05) return false;
    this._wakeNeighborhood(x, y, z);
    return true;
  }

  _processCell(x, y, z) {
    const cell = this.cells.get(key(x, y, z));
    if (!cell) return false;
    if (this._tryLavaWater(x, y, z, cell)) return true;
    if (this._phaseTransition(x, y, z, cell)) return true;
    if (cell.material === 'fire') return this._processFire(x, y, z, cell);
    let changed = this._combust(x, y, z, cell);
    if (!this.cells.has(key(x, y, z))) return true;
    if (this._moveMobile(x, y, z, cell)) return true;
    if (this._thermalStep(x, y, z, cell)) changed = true;
    return changed;
  }
}

module.exports = {
  CHUNK_SIZE, AMBIENT_TEMPERATURE, GRAVITY, MATERIALS,
  NEIGHBORS, NEIGHBORS_2D, NEIGHBORS_3D,
  MatterWorld, key, parseKey, chunkKey, hash32, normalizeCell
};

};
modules["world-structure-engine"]=function(module,exports,require){
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

};
modules["world-cluster-engine"]=function(module,exports,require){
'use strict';

function magnitude(v) { return Math.hypot(v.x || 0, v.y || 0, v.z || 0); }
function signStep(value) { return value > 0 ? 1 : value < 0 ? -1 : 0; }

class WorldClusterEngine {
  constructor({
    world, mode = 'voxel3d', gravity = -0.42, maxTranslationSteps = 3,
    fractureImpact = 7, voidY = -256, eventSink = null
  } = {}) {
    if (!world) throw new Error('WorldClusterEngine requires a MatterWorld');
    this.world = world;
    this.mode = mode === 'pixel2d' ? 'pixel2d' : 'voxel3d';
    this.gravity = Number.isFinite(gravity) ? gravity : -0.42;
    this.maxTranslationSteps = Math.max(1, Math.floor(maxTranslationSteps));
    this.fractureImpact = Math.max(0.1, Number(fractureImpact) || 7);
    this.voidY = Number.isFinite(voidY) ? voidY : -256;
    this.eventSink = typeof eventSink === 'function' ? eventSink : null;
    this.clusters = new Map();
  }

  add(cluster) {
    if (!cluster?.id || !Array.isArray(cluster.cells) || !cluster.cells.length) {
      throw new Error('Invalid detached cluster');
    }
    const copy = {
      ...cluster, origin: { ...cluster.origin }, center: { ...cluster.center },
      velocity: { x: 0, y: 0, z: 0, ...(cluster.velocity || {}) },
      angularVelocity: { x: 0, y: 0, z: 0, ...(cluster.angularVelocity || {}) },
      cells: cluster.cells.map(item => ({ ...item, cell: { ...item.cell } }))
    };
    if (this.mode === 'pixel2d') {
      copy.origin.z = 0; copy.velocity.z = 0;
      copy.angularVelocity.x = 0; copy.angularVelocity.y = 0;
    }
    this.clusters.set(copy.id, copy);
    return copy.id;
  }

  get(id) {
    const cluster = this.clusters.get(id);
    return cluster ? this._clone(cluster) : null;
  }

  snapshot() {
    return Array.from(this.clusters.values()).sort((a, b) => a.id.localeCompare(b.id))
      .map(cluster => this._clone(cluster));
  }

  applyImpulse(id, impulse, angular = null) {
    const cluster = this.clusters.get(id);
    if (!cluster) return false;
    cluster.velocity.x += Number(impulse?.x || 0);
    cluster.velocity.y += Number(impulse?.y || 0);
    if (this.mode === 'voxel3d') cluster.velocity.z += Number(impulse?.z || 0);
    if (angular) {
      if (this.mode === 'pixel2d') cluster.angularVelocity.z += Number(angular.z || 0);
      else cluster.angularVelocity.y += Number(angular.y || 0);
    }
    this._emit('cluster-impulse', { clusterId: id, impulse: { ...impulse } });
    return true;
  }

  applyRadialImpulse(origin, radius, force) {
    const r = Math.max(0.1, Number(radius) || 0.1), f = Number(force) || 0;
    let affected = 0;
    for (const cluster of this.clusters.values()) {
      const center = this._worldCenter(cluster);
      const dx = center.x - origin.x, dy = center.y - origin.y;
      const dz = this.mode === 'pixel2d' ? 0 : center.z - origin.z;
      const dist = Math.hypot(dx, dy, dz);
      if (dist > r) continue;
      const falloff = Math.max(0, 1 - dist / r), denom = Math.max(0.001, dist);
      const impulse = {
        x: dx / denom * f * falloff, y: dy / denom * f * falloff,
        z: dz / denom * f * falloff
      };
      const angular = this.mode === 'pixel2d'
        ? { z: (dx * impulse.y - dy * impulse.x) * 0.03 }
        : { y: (dz * impulse.x - dx * impulse.z) * 0.03 };
      this.applyImpulse(cluster.id, impulse, angular);
      affected++;
    }
    return affected;
  }

  step() {
    const ids = Array.from(this.clusters.keys()).sort();
    const report = { active: ids.length, moved: 0, settled: 0, shattered: 0, rotated: 0, voided: 0 };
    for (const id of ids) {
      const cluster = this.clusters.get(id);
      if (!cluster) continue;
      cluster.age = (cluster.age || 0) + 1;
      cluster.velocity.y += this.gravity;
      if (this._tryRotation(cluster)) report.rotated++;
      const speed = magnitude(cluster.velocity);
      const steps = Math.min(this.maxTranslationSteps, Math.floor(Math.max(
        Math.abs(cluster.velocity.x), Math.abs(cluster.velocity.y),
        this.mode === 'pixel2d' ? 0 : Math.abs(cluster.velocity.z)
      )));
      let moved = false, collided = false;
      for (let i = 0; i < Math.max(1, steps); i++) {
        const delta = this._stepVector(cluster.velocity, steps > 0);
        if (!delta.x && !delta.y && !delta.z) break;
        if (!this._canTranslate(cluster, delta)) { collided = true; break; }
        cluster.origin.x += delta.x; cluster.origin.y += delta.y; cluster.origin.z += delta.z;
        moved = true;
      }
      if (cluster.origin.y < this.voidY) {
        this.clusters.delete(id); report.voided++;
        this._emit('cluster-void', { clusterId: id }); continue;
      }
      if (moved) {
        report.moved++;
        this._emit('cluster-move', {
          clusterId: id, origin: { ...cluster.origin }, velocity: { ...cluster.velocity }
        });
      }
      if (!collided) continue;
      const averageStrength = cluster.strength / Math.max(1, cluster.cellCount);
      const brittle = averageStrength <= 3;
      const shouldShatter = speed >= this.fractureImpact ||
        (brittle && speed >= this.fractureImpact * 0.55);
      const impactPosition = this._worldCenter(cluster);
      this._deposit(cluster);
      this.clusters.delete(id);
      const result = shouldShatter ? 'shattered' : 'settled';
      report[shouldShatter ? 'shattered' : 'settled']++;
      this._emit('cluster-impact', {
        clusterId: id, speed, result, cellCount: cluster.cellCount, position: impactPosition
      });
    }
    report.active = this.clusters.size;
    return report;
  }

  _stepVector(velocity, allowSubunit) {
    const threshold = allowSubunit ? 0.5 : 1;
    const delta = {
      x: Math.abs(velocity.x) >= threshold ? signStep(velocity.x) : 0,
      y: Math.abs(velocity.y) >= threshold ? signStep(velocity.y) : 0,
      z: this.mode === 'pixel2d' ? 0 : (Math.abs(velocity.z) >= threshold ? signStep(velocity.z) : 0)
    };
    if (!delta.y && velocity.y < -0.25) delta.y = -1;
    return delta;
  }

  _tryRotation(cluster) {
    const angular = this.mode === 'pixel2d' ? cluster.angularVelocity.z : cluster.angularVelocity.y;
    if (Math.abs(angular) < 1) return false;
    const dir = angular > 0 ? 1 : -1;
    const rotated = cluster.cells.map(item => {
      if (this.mode === 'pixel2d') {
        return { ...item, dx: dir > 0 ? -item.dy : item.dy, dy: dir > 0 ? item.dx : -item.dx, dz: 0 };
      }
      return { ...item, dx: dir > 0 ? -item.dz : item.dz, dz: dir > 0 ? item.dx : -item.dx };
    });
    if (!this._canOccupy(cluster, cluster.origin, rotated)) return false;
    cluster.cells = rotated;
    cluster.orientationQuarterTurns = (cluster.orientationQuarterTurns || 0) + dir;
    if (this.mode === 'pixel2d') cluster.angularVelocity.z -= dir;
    else cluster.angularVelocity.y -= dir;
    this._emit('cluster-rotate', { clusterId: cluster.id, quarterTurns: dir });
    return true;
  }

  _canTranslate(cluster, delta) {
    const axes = [['y', delta.y], ['x', delta.x], ['z', this.mode === 'pixel2d' ? 0 : delta.z]];
    let probe = { ...cluster.origin };
    for (const [axis, step] of axes) {
      if (!step) continue;
      probe = { ...probe, [axis]: probe[axis] + step };
      if (!this._canOccupy(cluster, probe)) return false;
    }
    return true;
  }

  _canOccupy(cluster, origin, cells = cluster.cells) {
    for (const item of cells) {
      const x = origin.x + item.dx, y = origin.y + item.dy;
      const z = this.mode === 'pixel2d' ? 0 : origin.z + item.dz;
      if (this.world.hasCell(x, y, z)) return false;
    }
    return true;
  }

  _deposit(cluster) {
    for (const item of cluster.cells) {
      const x = cluster.origin.x + item.dx, y = cluster.origin.y + item.dy;
      const z = this.mode === 'pixel2d' ? 0 : cluster.origin.z + item.dz;
      if (this.world.hasCell(x, y, z)) continue;
      this.world.setCell(x, y, z, item.cell.material, item.cell);
    }
  }

  _worldCenter(cluster) {
    const count = Math.max(1, cluster.cells.length);
    const local = cluster.cells.reduce((acc, item) => ({
      x: acc.x + item.dx, y: acc.y + item.dy, z: acc.z + item.dz
    }), { x: 0, y: 0, z: 0 });
    return {
      x: cluster.origin.x + local.x / count,
      y: cluster.origin.y + local.y / count,
      z: this.mode === 'pixel2d' ? 0 : cluster.origin.z + local.z / count
    };
  }

  _clone(cluster) {
    return {
      ...cluster, origin: { ...cluster.origin }, center: { ...cluster.center },
      velocity: { ...cluster.velocity }, angularVelocity: { ...cluster.angularVelocity },
      cells: cluster.cells.map(item => ({ ...item, cell: { ...item.cell } }))
    };
  }

  _emit(type, detail) { this.eventSink?.({ tick: this.world.tick, type, ...detail }); }
}

module.exports = { WorldClusterEngine, magnitude, signStep };

};
modules["world-pressure-engine"]=function(module,exports,require){
'use strict';

const { MATERIALS } = require('./world-matter-engine');

const FRACTURE_PRODUCTS = Object.freeze({
  stone: 'dirt', glass: 'sand', wood: 'ash'
});

function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

function radialStep(dx, dy, dz, mode) {
  const ax = Math.abs(dx), ay = Math.abs(dy), az = mode === 'pixel2d' ? -1 : Math.abs(dz);
  if (ax === 0 && ay === 0 && (mode === 'pixel2d' || az === 0)) return { x: 0, y: 1, z: 0 };
  if (ay >= ax && ay >= az) return { x: 0, y: Math.sign(dy) || 1, z: 0 };
  if (ax >= az) return { x: Math.sign(dx) || 1, y: 0, z: 0 };
  return { x: 0, y: 0, z: Math.sign(dz) || 1 };
}

class WorldPressureEngine {
  constructor({
    world, clusters = null, mode = 'voxel3d',
    maxRadius = 32, maxCells = 20000, eventSink = null
  } = {}) {
    if (!world) throw new Error('WorldPressureEngine requires a MatterWorld');
    this.world = world;
    this.clusters = clusters;
    this.mode = mode === 'pixel2d' ? 'pixel2d' : 'voxel3d';
    this.maxRadius = Math.max(1, Math.floor(maxRadius));
    this.maxCells = Math.max(1, Math.floor(maxCells));
    this.eventSink = typeof eventSink === 'function' ? eventSink : null;
  }

  explode({ x, y, z = 0, radius = 6, force = 8, heat = 650, maxCells = this.maxCells } = {}) {
    if (![x, y, z, radius, force, heat].every(Number.isFinite)) {
      throw new Error('Explosion requires finite coordinates, radius, force and heat');
    }
    if (this.mode === 'pixel2d') z = 0;
    const context = this._collectExplosion({ x, y, z, radius, force, heat, maxCells });
    this._applyExplosionSamples(context);
    if (this.clusters && context.force > 0) {
      context.report.clustersAffected = this.clusters.applyRadialImpulse(
        { x, y, z }, context.radius, context.force
      );
    }
    this._emit('explosion', { ...context.report });
    return context.report;
  }

  _collectExplosion({ x, y, z, radius, force, heat, maxCells }) {
    const r = clamp(radius, 0.5, this.maxRadius), f = clamp(force, 0, 100);
    const thermal = clamp(heat, 0, 5000);
    const budget = Math.max(1, Math.min(this.maxCells, Math.floor(maxCells)));
    const zMin = this.mode === 'pixel2d' ? 0 : Math.floor(z - r);
    const zMax = this.mode === 'pixel2d' ? 0 : Math.ceil(z + r);
    const report = {
      center: { x, y, z }, radius: r, force: f, heat: thermal,
      visited: 0, affected: 0, damaged: 0, fractured: 0,
      displaced: 0, heated: 0, clustersAffected: 0, truncated: false
    };
    const samples = [], occupiedAtStart = new Set();
    this.world.forEachCell((cell, cx, cy, cz) => occupiedAtStart.add(`${cx},${cy},${cz}`));
    outer:
    for (let cy = Math.floor(y - r); cy <= Math.ceil(y + r); cy++) {
      for (let cx = Math.floor(x - r); cx <= Math.ceil(x + r); cx++) {
        for (let cz = zMin; cz <= zMax; cz++) {
          if (report.visited >= budget) { report.truncated = true; break outer; }
          report.visited++;
          const dx = cx - x, dy = cy - y, dz = this.mode === 'pixel2d' ? 0 : cz - z;
          const dist = Math.hypot(dx, dy, dz);
          if (dist > r) continue;
          const cell = this.world.getCell(cx, cy, cz);
          if (cell) samples.push({ cx, cy, cz, dx, dy, dz, dist, cell });
        }
      }
    }
    return { x, y, z, radius: r, force: f, thermal, report, samples, occupiedAtStart };
  }

  _applyExplosionSamples(context) {
    const reserved = new Set();
    for (const sample of context.samples) {
      const falloff = Math.max(0, 1 - sample.dist / context.radius);
      const def = MATERIALS[sample.cell.material] || {};
      context.report.affected++;
      if (context.thermal > 0 && falloff > 0) {
        sample.cell.temperature += context.thermal * falloff;
        context.report.heated++;
      }
      if (def.phase === 'solid') this._damageExplosionSolid(sample, falloff, context);
      else this._displaceExplosionMobile(sample, falloff, context, reserved);
    }
  }

  _damageExplosionSolid(sample, falloff, context) {
    const { cx, cy, cz, cell } = sample, def = MATERIALS[cell.material] || {};
    const damage = context.force * falloff;
    const beforeIntegrity = Number(cell.integrity ?? def.strength ?? 0);
    cell.integrity = Math.max(0, beforeIntegrity - damage);
    if (damage > 0) context.report.damaged++;
    if (beforeIntegrity > 0 && cell.integrity <= 0) {
      const product = FRACTURE_PRODUCTS[cell.material] || 'air';
      this.world.setCell(cx, cy, cz, product, {
        temperature: cell.temperature, integrity: MATERIALS[product]?.strength
      });
      context.report.fractured++;
      this._emit('cell-fracture', {
        at: { x: cx, y: cy, z: cz }, material: cell.material,
        product, impulse: context.force * falloff
      });
    } else this.world.setCell(cx, cy, cz, cell.material, cell);
  }

  _displaceExplosionMobile(sample, falloff, context, reserved) {
    const { cx, cy, cz, dx, dy, dz, cell } = sample;
    const step = radialStep(dx, dy, dz, this.mode);
    const nx = cx + step.x, ny = cy + step.y;
    const nz = this.mode === 'pixel2d' ? 0 : cz + step.z;
    const targetKey = `${nx},${ny},${nz}`;
    if (context.force * falloff >= 0.75 &&
        !context.occupiedAtStart.has(targetKey) && !reserved.has(targetKey)) {
      this.world.setCell(cx, cy, cz, 'air');
      this.world.setCell(nx, ny, nz, cell.material, cell);
      reserved.add(targetKey);
      context.report.displaced++;
    } else this.world.setCell(cx, cy, cz, cell.material, cell);
  }

  damageCell(x, y, z = 0, amount = 1) {
    if (this.mode === 'pixel2d') z = 0;
    const cell = this.world.getCell(x, y, z);
    if (!cell) return { changed: false, reason: 'air' };
    const def = MATERIALS[cell.material] || {};
    if (def.phase !== 'solid') return { changed: false, reason: 'non-solid' };
    const before = Number(cell.integrity ?? def.strength ?? 0);
    const after = Math.max(0, before - Math.max(0, Number(amount) || 0));
    if (after <= 0 && before > 0) {
      const product = FRACTURE_PRODUCTS[cell.material] || 'air';
      this.world.setCell(x, y, z, product, { temperature: cell.temperature });
      this._emit('cell-fracture', {
        at: { x, y, z }, material: cell.material, product, impulse: amount
      });
      return { changed: true, fractured: true, before, after: 0, product };
    }
    cell.integrity = after;
    this.world.setCell(x, y, z, cell.material, cell);
    return { changed: after !== before, fractured: false, before, after };
  }

  _emit(type, detail) { this.eventSink?.({ tick: this.world.tick, type, ...detail }); }
}

module.exports = { WorldPressureEngine, FRACTURE_PRODUCTS, radialStep, clamp };

};
modules["world-physics-runtime"]=function(module,exports,require){
'use strict';

const { MATERIALS, MatterWorld } = require('./world-matter-engine');
const { WorldStructureEngine } = require('./world-structure-engine');
const { WorldClusterEngine } = require('./world-cluster-engine');
const { WorldPressureEngine } = require('./world-pressure-engine');

class WorldPhysicsRuntime {
  constructor({
    seed = 1, mode = 'voxel3d', groundY = 0, eventLimit = 20000,
    maxStructuralCells = 100000, structureOptions = {},
    clusterOptions = {}, pressureOptions = {}
  } = {}) {
    this.mode = mode === 'pixel2d' ? 'pixel2d' : 'voxel3d';
    this.eventLimit = Math.max(128, Math.floor(eventLimit));
    this.events = [];
    this.structureDirty = false;
    this.world = new MatterWorld({
      seed, dimensions: this.mode === 'pixel2d' ? 2 : 3, eventLimit: 0,
      eventSink: event => this._capture(event)
    });
    this.structure = new WorldStructureEngine({
      world: this.world, mode: this.mode, groundY,
      maxCells: maxStructuralCells, eventSink: event => this._capture(event),
      ...structureOptions
    });
    this.clusters = new WorldClusterEngine({
      world: this.world, mode: this.mode,
      eventSink: event => this._capture(event), ...clusterOptions
    });
    this.pressure = new WorldPressureEngine({
      world: this.world, clusters: this.clusters, mode: this.mode,
      eventSink: event => this._capture(event), ...pressureOptions
    });
  }

  setCell(x, y, z, material, state = {}) {
    if (this.mode === 'pixel2d') z = 0;
    this.world.setCell(x, y, z, material, state);
    return this.world.getCell(x, y, z);
  }

  clearCell(x, y, z = 0) {
    if (this.mode === 'pixel2d') z = 0;
    this.world.setCell(x, y, z, 'air');
  }

  getCell(x, y, z = 0) {
    return this.world.getCell(x, y, this.mode === 'pixel2d' ? 0 : z);
  }

  addAnchor(x, y, z = 0) {
    this.structure.addAnchor(x, y, this.mode === 'pixel2d' ? 0 : z);
    this.structureDirty = true;
  }

  removeAnchor(x, y, z = 0) {
    this.structure.removeAnchor(x, y, this.mode === 'pixel2d' ? 0 : z);
    this.structureDirty = true;
  }

  analyzeStructure(options = {}) { return this.structure.analyze(options); }

  detachUnsupported(options = {}) {
    const result = this.structure.detachUnsupported(options);
    for (const cluster of result.detached || []) this.clusters.add(cluster);
    if (result.complete) this.structureDirty = false;
    return result;
  }

  explode(options) {
    const report = this.pressure.explode(options);
    if (report.damaged || report.fractured) this.structureDirty = true;
    return report;
  }

  damageCell(x, y, z, amount) {
    if (this.mode === 'pixel2d' && amount === undefined) { amount = z; z = 0; }
    const report = this.pressure.damageCell(
      x, y, this.mode === 'pixel2d' ? 0 : z, amount
    );
    if (report.changed) this.structureDirty = true;
    return report;
  }

  step({
    matterMaxCells = 50000, structural = true, detach = true,
    structureOptions = {}, clusterSteps = 1
  } = {}) {
    const matter = this.world.step({ maxCells: matterMaxCells });
    let structure = null;
    if (structural && this.structureDirty) {
      structure = detach
        ? this.detachUnsupported(structureOptions)
        : this.structure.analyze(structureOptions);
      if (!detach && structure?.complete) this.structureDirty = false;
    }
    let clusters = null;
    for (let i = 0; i < Math.max(0, Math.floor(clusterSteps)); i++) {
      clusters = this.clusters.step();
    }
    return {
      tick: this.world.tick, mode: this.mode, matter, structure,
      clusters: clusters || {
        active: this.clusters.clusters.size,
        moved: 0, settled: 0, shattered: 0, rotated: 0, voided: 0
      },
      eventsPending: this.events.length
    };
  }

  snapshot() {
    return {
      mode: this.mode, world: this.world.snapshot(),
      clusters: this.clusters.snapshot(), stats: this.stats()
    };
  }

  stats() {
    return {
      ...this.world.stats(), mode: this.mode,
      detachedClusters: this.clusters.clusters.size,
      structureDirty: this.structureDirty, eventsPending: this.events.length
    };
  }

  drainEvents() { const out = this.events; this.events = []; return out; }

  _capture(event) {
    this.events.push(event);
    if (this.events.length > this.eventLimit) {
      this.events.splice(0, this.events.length - this.eventLimit);
    }
    if (event.type === 'cell-set' || event.type === 'cell-cleared') {
      const beforeSolid = MATERIALS[event.before]?.phase === 'solid';
      const afterSolid = MATERIALS[event.after]?.phase === 'solid';
      if (beforeSolid || afterSolid) this.structureDirty = true;
    }
    if (event.type === 'cell-fracture' || event.type === 'burnout') this.structureDirty = true;
  }
}

module.exports = { WorldPhysicsRuntime };

};
modules["world-cell-adapters"]=function(module,exports,require){
'use strict';

const DEFAULT_VOXEL_TO_MATTER = Object.freeze({
  0:'air',1:'dirt',2:'dirt',3:'stone',4:'sand',5:'wood',6:'wood',
  7:'snow',8:'water',9:'glass',10:'stone',11:'wood',12:'coal',13:'metal'
});
const DEFAULT_MATTER_TO_VOXEL = Object.freeze({
  dirt:2,stone:3,sand:4,wood:5,snow:7,water:8,glass:9,coal:12,metal:13
});

class PixelCellAdapter {
  constructor(runtime) {
    if (!runtime || runtime.mode !== 'pixel2d') throw new Error('PixelCellAdapter requires pixel2d runtime');
    this.runtime = runtime;
  }
  set(x,y,material,state={}) { return this.runtime.setCell(x,y,0,material,state); }
  get(x,y) { return this.runtime.getCell(x,y,0); }
  clear(x,y) { this.runtime.clearCell(x,y,0); }
  addAnchor(x,y) { this.runtime.addAnchor(x,y,0); }
  explode(x,y,options={}) { return this.runtime.explode({x,y,z:0,...options}); }
  snapshot() {
    return this.runtime.world.snapshot().map(item => {
      const [x,y] = item.position.split(',').map(Number);
      return {x,y,...item};
    });
  }
}

class VoxelCellAdapter {
  constructor(runtime,{
    voxelToMatter=DEFAULT_VOXEL_TO_MATTER,matterToVoxel=DEFAULT_MATTER_TO_VOXEL
  }={}) {
    if (!runtime || runtime.mode !== 'voxel3d') throw new Error('VoxelCellAdapter requires voxel3d runtime');
    this.runtime=runtime; this.voxelToMatter={...voxelToMatter}; this.matterToVoxel={...matterToVoxel};
  }
  set(x,y,z,material,state={}) { return this.runtime.setCell(x,y,z,material,state); }
  get(x,y,z) { return this.runtime.getCell(x,y,z); }
  clear(x,y,z) { this.runtime.clearCell(x,y,z); }
  addAnchor(x,y,z) { this.runtime.addAnchor(x,y,z); }
  explode(x,y,z,options={}) { return this.runtime.explode({x,y,z,...options}); }

  importRegion({min,max,getBlock,maxCells=100000}={}) {
    if (!min || !max || typeof getBlock !== 'function') throw new Error('importRegion requires min/max/getBlock');
    let visited=0,imported=0,unsupported=0;
    const total=(max.x-min.x+1)*(max.y-min.y+1)*(max.z-min.z+1);
    outer: for(let y=min.y;y<=max.y;y++)for(let x=min.x;x<=max.x;x++)for(let z=min.z;z<=max.z;z++){
      if(visited>=maxCells)break outer; visited++;
      const block=getBlock(x,y,z),material=this.voxelToMatter[block];
      if(material===undefined){if(Number(block)!==0)unsupported++;continue;}
      if(material==='air')continue;
      this.runtime.setCell(x,y,z,material);imported++;
    }
    return{visited,imported,unsupported,truncated:visited<total};
  }

  importRows(rows,{
    getBlockId=row=>row.block_type??row.block,
    getPosition=row=>({x:row.x,y:row.y,z:row.z})
  }={}) {
    let imported=0,unsupported=0;
    for(const row of rows||[]){
      const pos=getPosition(row);if(![pos.x,pos.y,pos.z].every(Number.isInteger))continue;
      const material=this.voxelToMatter[getBlockId(row)];
      if(material===undefined){unsupported++;continue;}
      if(material==='air')this.runtime.clearCell(pos.x,pos.y,pos.z);
      else this.runtime.setCell(pos.x,pos.y,pos.z,material);
      imported++;
    }
    return{imported,unsupported};
  }

  exportVoxelState() {
    const voxels=[],dynamicMatter=[];
    this.runtime.world.forEachCell((cell,x,y,z)=>{
      const block=this.matterToVoxel[cell.material];
      if(block===undefined)dynamicMatter.push({x,y,z,cell});else voxels.push({x,y,z,block});
    });
    voxels.sort(positionSort);dynamicMatter.sort(positionSort);
    return{voxels,dynamicMatter};
  }

  changesFromEvents(events) {
    const changes=new Map();
    const record=(x,y,z,before,after)=>{
      const beforeBlock=before==='air'?0:this.matterToVoxel[before];
      const afterBlock=after==='air'?0:this.matterToVoxel[after];
      let block=afterBlock;
      if(afterBlock===undefined&&beforeBlock!==undefined&&beforeBlock!==0)block=0;
      changes.set(`${x},${y},${z}`,{
        x,y,z,block:block===undefined?null:block,
        dynamicMaterial:afterBlock===undefined&&after!=='air'?after:null
      });
    };
    for(const event of events||[]){
      if(event.type==='cell-set'||event.type==='cell-cleared'){
        const {x,y,z}=event.position;record(x,y,z,event.before,event.after);continue;
      }
      if(event.type==='cell-move'){
        record(event.from.x,event.from.y,event.from.z,event.material,'air');
        record(event.to.x,event.to.y,event.to.z,'air',event.material);continue;
      }
      if(event.type==='cell-swap'){
        record(event.first.x,event.first.y,event.first.z,event.a,event.b);
        record(event.second.x,event.second.y,event.second.z,event.b,event.a);
      }
    }
    return Array.from(changes.values()).sort(positionSort);
  }
}

function positionSort(a,b){return a.y-b.y||a.x-b.x||(a.z||0)-(b.z||0);}

module.exports={
  PixelCellAdapter,VoxelCellAdapter,
  DEFAULT_VOXEL_TO_MATTER,DEFAULT_MATTER_TO_VOXEL,positionSort
};

};
modules["world-physics-sequencer"]=function(module,exports,require){
'use strict';

class WorldPhysicsSequencer {
  constructor(runtime, actions = []) {
    if (!runtime) throw new Error('WorldPhysicsSequencer requires a WorldPhysicsRuntime');
    this.runtime = runtime;
    this.actions = actions.map((action,index)=>({
      ...action,at:Math.max(0,Math.floor(Number(action.at)||0)),_index:index
    })).sort((a,b)=>a.at-b.at||a._index-b._index);
    this.cursor=0;this.tick=0;this.events=[];
  }
  reset(){this.cursor=0;this.tick=0;this.events=[];}
  step(runtimeOptions={}) {
    const executed=[];
    while(this.cursor<this.actions.length&&this.actions[this.cursor].at<=this.tick){
      const action=this.actions[this.cursor++];executed.push({action,result:this._execute(action)});
    }
    const physics=this.runtime.step(runtimeOptions),sequenceEvents=this.events;
    this.events=[];const out={tick:this.tick,executed,physics,sequenceEvents};this.tick++;return out;
  }
  run(ticks,runtimeOptions={}) {
    const results=[];for(let i=0;i<Math.max(0,Math.floor(ticks));i++)results.push(this.step(runtimeOptions));return results;
  }
  _execute(action) {
    const p=action.position||{};
    switch(action.type){
      case'set':return this.runtime.setCell(p.x,p.y,p.z||0,action.material,action.state||{});
      case'clear':this.runtime.clearCell(p.x,p.y,p.z||0);return true;
      case'fill':return this._fill(action);
      case'anchor':this.runtime.addAnchor(p.x,p.y,p.z||0);return true;
      case'remove-anchor':this.runtime.removeAnchor(p.x,p.y,p.z||0);return true;
      case'ignite':{
        const cell=this.runtime.getCell(p.x,p.y,p.z||0);if(!cell)return false;
        cell.burning=true;cell.temperature=Math.max(Number(cell.temperature||20),Number(action.temperature||500));
        this.runtime.setCell(p.x,p.y,p.z||0,cell.material,cell);return true;
      }
      case'explode':return this.runtime.explode({...p,...(action.options||{})});
      case'impulse':return this.runtime.clusters.applyImpulse(action.clusterId,action.impulse||{},action.angular||{});
      case'transition':case'camera':case'marker':{
        const event={tick:this.tick,type:`sequence-${action.type}`,name:action.name||null,
          position:action.position||null,payload:action.payload||null};
        this.events.push(event);return event;
      }
      default:throw new Error(`Unsupported physics sequence action: ${action.type}`);
    }
  }
  _fill(action) {
    const min=action.min||{},max=action.max||min;
    if(![min.x,min.y,max.x,max.y].every(Number.isFinite))throw new Error('fill requires finite min/max x/y');
    const zMin=this.runtime.mode==='pixel2d'?0:Number(min.z||0);
    const zMax=this.runtime.mode==='pixel2d'?0:Number(max.z??zMin);
    let placed=0;
    for(let y=min.y;y<=max.y;y++)for(let x=min.x;x<=max.x;x++)for(let z=zMin;z<=zMax;z++){
      this.runtime.setCell(x,y,z,action.material,action.state||{});placed++;
    }
    return{placed};
  }
}
module.exports={WorldPhysicsSequencer};

};
modules["world-physics-render-bridge"]=function(module,exports,require){
'use strict';

function eventPosition(event){return event.at||event.center||event.position||event.to||event.origin||null;}

function renderCommandsForEvents(events,{maxCommands=2000}={}) {
  const commands=[],push=command=>{if(commands.length<maxCommands)commands.push(command);};
  for(const event of events||[]){
    const position=eventPosition(event);
    if(event.type==='reaction'&&event.reaction==='lava-water'){
      push({type:'particle-emitter',effect:'steam-burst',position:event.neighbor||position,intensity:1});
      push({type:'light-pulse',effect:'thermal-flash',position,intensity:.7,duration:.18});continue;
    }
    if(event.type==='phase-change'){
      push({type:'particle-emitter',effect:event.to==='steam'?'steam':'condensation',position,intensity:.45});continue;
    }
    if(event.type==='ignition'){
      push({type:'particle-emitter',effect:'fire-sparks',position,intensity:.8});
      push({type:'light-emitter',effect:'fire',action:'start',position,intensity:.8});continue;
    }
    if(event.type==='burnout'||event.type==='extinguished'){
      push({type:'particle-emitter',effect:event.type==='burnout'?'ash':'steam-puff',position,intensity:.6});
      push({type:'light-emitter',effect:'fire',action:'fade',position,intensity:.35});continue;
    }
    if(event.type==='cell-fracture'){
      push({type:'particle-emitter',effect:'debris',position,material:event.material,
        intensity:Math.max(.25,Math.min(2,Number(event.impulse||1)/5))});continue;
    }
    if(event.type==='cluster-detached'){
      push({type:'physics-visual',effect:'cluster-detached',clusterId:event.clusterId,
        position:event.center,cellCount:event.cellCount});continue;
    }
    if(event.type==='cluster-impact'){
      push({type:'particle-emitter',effect:event.result==='shattered'?'debris-burst':'dust-impact',
        position,intensity:Math.max(.3,Math.min(2.5,Number(event.speed||0)/4))});
      push({type:'camera-impulse',effect:'impact',strength:Math.max(.05,Math.min(1.5,Number(event.speed||0)/12))});continue;
    }
    if(event.type==='explosion'){
      push({type:'particle-emitter',effect:'explosion',position:event.center,
        intensity:Math.max(.5,Math.min(3,Number(event.force||0)/5))});
      push({type:'light-pulse',effect:'explosion',position:event.center,
        intensity:Math.max(.8,Math.min(4,Number(event.force||0)/3)),duration:.22});
      push({type:'camera-impulse',effect:'explosion',strength:Math.max(.1,Math.min(2,Number(event.force||0)/10))});
    }
  }
  return commands;
}
module.exports={renderCommandsForEvents,eventPosition};

};
modules["world-physics-browser-entry"]=function(module,exports,require){
'use strict';

const matter=require('./world-matter-engine');
const {WorldStructureEngine}=require('./world-structure-engine');
const {WorldClusterEngine}=require('./world-cluster-engine');
const {WorldPressureEngine}=require('./world-pressure-engine');
const {WorldPhysicsRuntime}=require('./world-physics-runtime');
const adapters=require('./world-cell-adapters');
const {WorldPhysicsSequencer}=require('./world-physics-sequencer');
const renderBridge=require('./world-physics-render-bridge');

module.exports={...matter,WorldStructureEngine,WorldClusterEngine,WorldPressureEngine,
  WorldPhysicsRuntime,WorldPhysicsSequencer,...adapters,...renderBridge};

};
function localRequire(request){const id=String(request).replace(/^\.\//,'').replace(/\.js$/,'');if(cache[id])return cache[id].exports;const factory=modules[id];if(!factory)throw new Error('Unknown bundled module: '+request);const module={exports:{}};cache[id]=module;factory(module,module.exports,localRequire);return module.exports;}
global.WorldPhysicsRuntime=Object.freeze(localRequire('world-physics-browser-entry'));
})(globalThis);
