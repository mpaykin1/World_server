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
