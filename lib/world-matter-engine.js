'use strict';

const CHUNK_SIZE = 16;
const AMBIENT_TEMPERATURE = 20;
const NEIGHBORS = Object.freeze([
  [0, 1, 0], [0, -1, 0], [1, 0, 0],
  [-1, 0, 0], [0, 0, 1], [0, 0, -1]
]);

const MATERIALS = Object.freeze({
  stone: { phase: 'solid', density: 2.7, conductivity: 0.08 },
  ash: { phase: 'powder', density: 0.45, conductivity: 0.04 },
  sand: { phase: 'powder', density: 1.6, conductivity: 0.05 },
  water: { phase: 'liquid', density: 1, conductivity: 0.15, boil: 100 },
  oil: { phase: 'liquid', density: 0.82, conductivity: 0.07, ignition: 220, fuel: 5 },
  wood: { phase: 'solid', density: 0.7, conductivity: 0.04, ignition: 300, fuel: 8 },
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
function shuffledHorizontalDirections(seed, tick, x, y, z) {
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  const offset = hash32(`${seed}:${tick}:${x}:${y}:${z}`) % dirs.length;
  return dirs.slice(offset).concat(dirs.slice(0, offset));
}
function normalizeCell(material, state = {}) {
  const def = MATERIALS[material];
  if (!def) throw new Error(`Unknown matter material: ${material}`);
  return {
    material,
    temperature: Number.isFinite(state.temperature) ? state.temperature : (def.temperature ?? AMBIENT_TEMPERATURE),
    burning: Boolean(state.burning),
    fuel: Number.isFinite(state.fuel) ? state.fuel : (def.fuel ?? 0),
    life: Number.isFinite(state.life) ? state.life : (def.life ?? 0)
  };
}

class MatterWorld {
  constructor({ seed = 1 } = {}) {
    this.seed = seed;
    this.tick = 0;
    this.cells = new Map();
    this.activeCells = new Set();
    this.nextActive = null;
  }

  getCell(x, y, z) {
    return cloneCell(this.cells.get(key(x, y, z)));
  }

  setCell(x, y, z, material, state = {}) {
    const k = key(x, y, z);
    if (!material || material === 'air') this.cells.delete(k);
    else this.cells.set(k, normalizeCell(material, state));
    this._wakeNeighborhood(x, y, z);
  }

  snapshot() {
    return Array.from(this.cells, ([position, cell]) => ({ position, ...cloneCell(cell) }))
      .sort((a, b) => a.position.localeCompare(b.position));
  }

  stats() {
    const chunks = new Set();
    for (const position of this.activeCells) {
      if (!this.cells.has(position)) continue;
      const [x, y, z] = parseKey(position);
      chunks.add(chunkKey(x, y, z));
    }
    return { tick: this.tick, cells: this.cells.size, activeCells: this.activeCells.size, activeChunks: chunks.size };
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

  _targetActive() { return this.nextActive || this.activeCells; }

  _wakeNeighborhood(x, y, z) {
    const target = this._targetActive();
    target.add(key(x, y, z));
    for (const [dx, dy, dz] of NEIGHBORS) target.add(key(x + dx, y + dy, z + dz));
  }

  _replace(x, y, z, material, state = {}) {
    this.setCell(x, y, z, material, state);
    return true;
  }

  _move(x, y, z, nx, ny, nz) {
    const sourceKey = key(x, y, z), destKey = key(nx, ny, nz);
    const source = this.cells.get(sourceKey);
    if (!source || this.cells.has(destKey)) return false;
    this.cells.set(destKey, source);
    this.cells.delete(sourceKey);
    this._wakeNeighborhood(x, y, z);
    this._wakeNeighborhood(nx, ny, nz);
    return true;
  }

  _swap(x, y, z, nx, ny, nz) {
    const aKey = key(x, y, z), bKey = key(nx, ny, nz);
    const a = this.cells.get(aKey), b = this.cells.get(bKey);
    if (!a || !b) return false;
    this.cells.set(aKey, b);
    this.cells.set(bKey, a);
    this._wakeNeighborhood(x, y, z);
    this._wakeNeighborhood(nx, ny, nz);
    return true;
  }

  _canDisplace(cell, target) {
    if (!target) return true;
    const a = MATERIALS[cell.material], b = MATERIALS[target.material];
    return ['powder','liquid'].includes(a.phase) && ['liquid','gas'].includes(b.phase) && a.density > b.density;
  }

  _tryMoveOrSwap(x, y, z, nx, ny, nz) {
    const cell = this.cells.get(key(x, y, z));
    const target = this.cells.get(key(nx, ny, nz));
    if (!cell) return false;
    if (!target) return this._move(x, y, z, nx, ny, nz);
    return this._canDisplace(cell, target) ? this._swap(x, y, z, nx, ny, nz) : false;
  }

  _adjacent(x, y, z) {
    return NEIGHBORS.map(([dx,dy,dz]) => [x + dx, y + dy, z + dz]);
  }

  _tryLavaWater(x, y, z, cell) {
    if (cell.material !== 'lava') return false;
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const neighbor = this.cells.get(key(nx, ny, nz));
      if (neighbor?.material !== 'water') continue;
      this.setCell(x, y, z, 'stone', { temperature: 260 });
      this.setCell(nx, ny, nz, 'steam', { temperature: 140, life: 12 });
      return true;
    }
    return false;
  }

  _phaseTransition(x, y, z, cell) {
    if (cell.material === 'water' && cell.temperature >= MATERIALS.water.boil) {
      return this._replace(x, y, z, 'steam', { temperature: cell.temperature, life: 12 });
    }
    if (cell.material === 'steam' && cell.temperature <= MATERIALS.steam.condense) {
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
    const nearIgnition = this._adjacent(x, y, z).some(([nx,ny,nz]) => {
      const material = this.cells.get(key(nx,ny,nz))?.material;
      return material === 'fire' || material === 'lava';
    });
    if (def.ignition && !cell.burning && (cell.temperature >= def.ignition || nearIgnition)) {
      cell.burning = true;
      cell.temperature = Math.max(cell.temperature, def.ignition + 120);
    }
    if (!cell.burning) return false;
    cell.fuel -= 1;
    cell.temperature = Math.max(cell.temperature, 500);
    this._heatNeighbors(x, y, z, 260);
    if (!this.cells.has(key(x, y + 1, z))) this.setCell(x, y + 1, z, 'fire');
    this._wakeNeighborhood(x, y, z);
    if (cell.fuel > 0) return true;
    if (cell.material === 'wood') this.setCell(x, y, z, 'ash', { temperature: 160 });
    else this.setCell(x, y, z, 'air');
    return true;
  }

  _processFire(x, y, z, fire) {
    // Fire uses life as its TTL. Flammable solids/liquids use fuel in _combust.
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const target = this.cells.get(key(nx, ny, nz));
      const targetDef = target && MATERIALS[target.material];
      if (targetDef?.ignition) {
        target.burning = true;
        target.temperature = Math.max(target.temperature, targetDef.ignition + 120);
        this._wakeNeighborhood(nx, ny, nz);
      }
    }
    for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
      const water = this.cells.get(key(nx, ny, nz));
      if (water?.material !== 'water') continue;
      water.temperature += 45;
      this.setCell(nx, ny, nz, 'water', water);
      this.setCell(x, y, z, 'air');
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
    const horizontal = shuffledHorizontalDirections(this.seed, this.tick, x, y, z);
    if (phase === 'powder') {
      if (this._tryMoveOrSwap(x, y, z, x, y - 1, z)) return true;
      for (const [dx,dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, y - 1, z + dz)) return true;
    }
    if (phase === 'liquid') {
      if (this._tryMoveOrSwap(x, y, z, x, y - 1, z)) return true;
      for (const [dx,dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, y, z + dz)) return true;
    }
    if (phase === 'gas') {
      if (this._tryMoveOrSwap(x, y, z, x, y + 1, z)) return true;
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
  CHUNK_SIZE, AMBIENT_TEMPERATURE, MATERIALS, MatterWorld, key, chunkKey
};
