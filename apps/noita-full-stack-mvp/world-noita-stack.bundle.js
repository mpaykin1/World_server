"use strict";
var WorldNoitaStack = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    try {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    } catch (e) {
      throw mod = 0, e;
    }
  };

  // lib/world-matter-engine.js
  var require_world_matter_engine = __commonJS({
    "lib/world-matter-engine.js"(exports, module) {
      "use strict";
      var CHUNK_SIZE = 16;
      var AMBIENT_TEMPERATURE = 20;
      var GRAVITY = Object.freeze({ x: 0, y: -1, z: 0 });
      var NEIGHBORS = Object.freeze([
        [0, 1, 0],
        [0, -1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1]
      ]);
      var MATERIALS = Object.freeze({
        stone: { phase: "solid", density: 2.7, conductivity: 0.08, structural: true, integrity: 1 },
        ash: { phase: "powder", density: 0.45, conductivity: 0.04, integrity: 0.08 },
        sand: { phase: "powder", density: 1.6, conductivity: 0.05, integrity: 0.12 },
        water: { phase: "liquid", density: 1, conductivity: 0.15, boil: 100, integrity: 0 },
        oil: { phase: "liquid", density: 0.82, conductivity: 0.07, ignition: 220, fuel: 5, integrity: 0 },
        wood: { phase: "solid", density: 0.7, conductivity: 0.04, ignition: 300, fuel: 8, structural: true, integrity: 0.72 },
        steam: { phase: "gas", density: 0.02, conductivity: 0.03, condense: 82, integrity: 0 },
        fire: { phase: "gas", density: 0.01, conductivity: 0.02, temperature: 700, life: 4, emission: 1, integrity: 0 },
        lava: { phase: "liquid", density: 3.1, conductivity: 0.18, temperature: 1050, emission: 0.92, integrity: 0 }
      });
      function key(x, y, z) {
        return `${x},${y},${z}`;
      }
      function parseKey(value) {
        return value.split(",").map(Number);
      }
      function chunkKey(x, y, z) {
        return `${Math.floor(x / CHUNK_SIZE)},${Math.floor(y / CHUNK_SIZE)},${Math.floor(z / CHUNK_SIZE)}`;
      }
      function cloneCell(cell) {
        return cell ? { ...cell } : null;
      }
      function hash32(value) {
        let h = 2166136261;
        for (const char of String(value)) {
          h ^= char.charCodeAt(0);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }
      function shuffledHorizontalDirections(seed, tick, x, y, z) {
        const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        const offset = hash32(`${seed}:${tick}:${x}:${y}:${z}`) % dirs.length;
        return dirs.slice(offset).concat(dirs.slice(0, offset));
      }
      function normalizeCell(material, state = {}) {
        const def = MATERIALS[material];
        if (!def) throw new Error(`Unknown matter material: ${material}`);
        return {
          material,
          temperature: Number.isFinite(state.temperature) ? state.temperature : def.temperature ?? AMBIENT_TEMPERATURE,
          burning: Boolean(def.ignition && state.burning),
          fuel: Number.isFinite(state.fuel) ? state.fuel : def.fuel ?? 0,
          life: Number.isFinite(state.life) ? state.life : def.life ?? 0,
          integrity: Number.isFinite(state.integrity) ? state.integrity : def.integrity ?? 0,
          emission: Number.isFinite(state.emission) ? state.emission : def.emission ?? 0
        };
      }
      var MatterWorld = class {
        constructor({ seed = 1 } = {}) {
          this.seed = seed;
          this.tick = 0;
          this.cells = /* @__PURE__ */ new Map();
          this.activeCells = /* @__PURE__ */ new Set();
          this.nextActive = null;
          this.events = [];
        }
        getCell(x, y, z) {
          return cloneCell(this.cells.get(key(x, y, z)));
        }
        setCell(x, y, z, material, state = {}) {
          const k = key(x, y, z);
          if (!material || material === "air") this.cells.delete(k);
          else this.cells.set(k, normalizeCell(material, state));
          this._wakeNeighborhood(x, y, z);
        }
        snapshot() {
          return Array.from(this.cells, ([position, cell]) => ({ position, ...cloneCell(cell) })).sort((a, b) => a.position.localeCompare(b.position));
        }
        drainEvents() {
          const out = this.events;
          this.events = [];
          return out;
        }
        _emit(type, data = {}) {
          this.events.push({ type, tick: this.tick, ...data });
        }
        stats() {
          const chunks = /* @__PURE__ */ new Set();
          for (const position of this.activeCells) {
            if (!this.cells.has(position)) continue;
            const [x, y, z] = parseKey(position);
            chunks.add(chunkKey(x, y, z));
          }
          return { tick: this.tick, cells: this.cells.size, activeCells: this.activeCells.size, activeChunks: chunks.size };
        }
        step({ maxCells = 5e4 } = {}) {
          const queue = Array.from(this.activeCells).filter((position) => this.cells.has(position));
          queue.sort((a, b) => hash32(`${this.seed}:${this.tick}:${a}`) - hash32(`${this.seed}:${this.tick}:${b}`));
          this.activeCells = /* @__PURE__ */ new Set();
          this.nextActive = /* @__PURE__ */ new Set();
          let processed = 0, changed = 0;
          for (const position of queue) {
            if (processed >= maxCells) {
              this.nextActive.add(position);
              continue;
            }
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
        _targetActive() {
          return this.nextActive || this.activeCells;
        }
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
          this._emit("move", { material: source.material, from: [x, y, z], to: [nx, ny, nz] });
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
          return ["powder", "liquid"].includes(a.phase) && ["liquid", "gas"].includes(b.phase) && a.density > b.density;
        }
        _tryMoveOrSwap(x, y, z, nx, ny, nz) {
          const cell = this.cells.get(key(x, y, z));
          const target = this.cells.get(key(nx, ny, nz));
          if (!cell) return false;
          if (!target) return this._move(x, y, z, nx, ny, nz);
          return this._canDisplace(cell, target) ? this._swap(x, y, z, nx, ny, nz) : false;
        }
        _adjacent(x, y, z) {
          return NEIGHBORS.map(([dx, dy, dz]) => [x + dx, y + dy, z + dz]);
        }
        _tryLavaWater(x, y, z, cell) {
          if (cell.material !== "lava") return false;
          for (const [nx, ny, nz] of this._adjacent(x, y, z)) {
            const neighbor = this.cells.get(key(nx, ny, nz));
            if (neighbor?.material !== "water") continue;
            this.setCell(x, y, z, "stone", { temperature: 260 });
            this.setCell(nx, ny, nz, "steam", { temperature: 140, life: 12 });
            this._emit("reaction", { reaction: "lava-water", at: [x, y, z], other: [nx, ny, nz] });
            return true;
          }
          return false;
        }
        _phaseTransition(x, y, z, cell) {
          if (cell.material === "water" && cell.temperature >= MATERIALS.water.boil) {
            this._emit("phase-change", { from: "water", to: "steam", at: [x, y, z] });
            return this._replace(x, y, z, "steam", { temperature: cell.temperature, life: 12 });
          }
          if (cell.material === "steam" && cell.temperature <= MATERIALS.steam.condense) {
            this._emit("phase-change", { from: "steam", to: "water", at: [x, y, z] });
            return this._replace(x, y, z, "water", { temperature: cell.temperature });
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
          const nearIgnition = this._adjacent(x, y, z).some(([nx, ny, nz]) => {
            const material = this.cells.get(key(nx, ny, nz))?.material;
            return material === "fire" || material === "lava";
          });
          if (def.ignition && !cell.burning && (cell.temperature >= def.ignition || nearIgnition)) {
            cell.burning = true;
            cell.temperature = Math.max(cell.temperature, def.ignition + 120);
            this._emit("ignite", { material: cell.material, at: [x, y, z] });
          }
          if (!cell.burning) return false;
          cell.fuel -= 1;
          cell.temperature = Math.max(cell.temperature, 500);
          this._heatNeighbors(x, y, z, 260);
          const aboveY = y - GRAVITY.y;
          if (!this.cells.has(key(x, aboveY, z))) this.setCell(x, aboveY, z, "fire");
          this._wakeNeighborhood(x, y, z);
          if (cell.fuel > 0) return true;
          if (cell.material === "wood") this.setCell(x, y, z, "ash", { temperature: 160 });
          else this.setCell(x, y, z, "air");
          return true;
        }
        _processFire(x, y, z, fire) {
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
            if (water?.material !== "water") continue;
            water.temperature += 45;
            this.setCell(nx, ny, nz, "water", water);
            this.setCell(x, y, z, "air");
            return true;
          }
          this._heatNeighbors(x, y, z, 320);
          fire.life -= 1;
          if (fire.life <= 0) return this._replace(x, y, z, "air");
          this._wakeNeighborhood(x, y, z);
          return this._moveMobile(x, y, z, fire);
        }
        _moveMobile(x, y, z, cell) {
          const phase = MATERIALS[cell.material].phase;
          const horizontal = shuffledHorizontalDirections(this.seed, this.tick, x, y, z);
          const downY = y + GRAVITY.y;
          const upY = y - GRAVITY.y;
          if (phase === "powder") {
            if (this._tryMoveOrSwap(x, y, z, x, downY, z)) return true;
            for (const [dx, dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, downY, z + dz)) return true;
          }
          if (phase === "liquid") {
            if (this._tryMoveOrSwap(x, y, z, x, downY, z)) return true;
            for (const [dx, dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, y, z + dz)) return true;
          }
          if (phase === "gas") {
            if (this._tryMoveOrSwap(x, y, z, x, upY, z)) return true;
            for (const [dx, dz] of horizontal) if (this._tryMoveOrSwap(x, y, z, x + dx, y, z + dz)) return true;
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
          if (cell.material === "fire") return this._processFire(x, y, z, cell);
          let changed = this._combust(x, y, z, cell);
          if (!this.cells.has(key(x, y, z))) return true;
          if (this._moveMobile(x, y, z, cell)) return true;
          if (this._thermalStep(x, y, z, cell)) changed = true;
          return changed;
        }
      };
      module.exports = {
        CHUNK_SIZE,
        AMBIENT_TEMPERATURE,
        GRAVITY,
        MATERIALS,
        MatterWorld,
        key,
        chunkKey
      };
    }
  });

  // lib/world-matter-dense-grid.js
  var require_world_matter_dense_grid = __commonJS({
    "lib/world-matter-dense-grid.js"(exports, module) {
      "use strict";
      var { MATERIALS, AMBIENT_TEMPERATURE } = require_world_matter_engine();
      var MATERIAL_IDS = Object.freeze({
        air: 0,
        stone: 1,
        sand: 2,
        water: 3,
        oil: 4,
        wood: 5,
        steam: 6,
        fire: 7,
        lava: 8,
        ash: 9
      });
      var ID_TO_MATERIAL = Object.freeze(
        Object.keys(MATERIAL_IDS).sort((a, b) => MATERIAL_IDS[a] - MATERIAL_IDS[b])
      );
      var FLAG_BURNING = 1;
      function hash32(value) {
        let h = 2166136261;
        for (const ch of String(value)) {
          h ^= ch.charCodeAt(0);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }
      var DenseMatterGrid = class {
        constructor(width, height, options = {}) {
          if (width < 1 || height < 1) throw new Error("DenseMatterGrid needs positive size");
          this.width = width;
          this.height = height;
          this.size = width * height;
          this.seed = Number(options.seed) || 1;
          this.tick = 0;
          this.material = new Uint8Array(this.size);
          this.temperature = new Int16Array(this.size);
          this.fuel = new Uint8Array(this.size);
          this.life = new Uint8Array(this.size);
          this.flags = new Uint8Array(this.size);
          this.active = new Uint8Array(this.size);
          this.nextActive = new Uint8Array(this.size);
          this.activeList = [];
          this.nextList = [];
          this.stepping = false;
          this.events = [];
          this.emitMoves = Boolean(options.emitMoves);
          this.occupiedCount = 0;
          this.emissiveCount = 0;
          this.externalSolid = typeof options.externalSolid === "function" ? options.externalSolid : null;
          this.temperature.fill(AMBIENT_TEMPERATURE);
        }
        index(x, y) {
          return y * this.width + x;
        }
        inBounds(x, y) {
          return x >= 0 && y >= 0 && x < this.width && y < this.height;
        }
        setExternalSolid(fn) {
          this.externalSolid = typeof fn === "function" ? fn : null;
        }
        blocked(x, y) {
          return !this.inBounds(x, y) || Boolean(this.externalSolid?.(x, y));
        }
        nameAt(i) {
          return ID_TO_MATERIAL[this.material[i]] || "air";
        }
        get(x, y) {
          if (!this.inBounds(x, y)) return null;
          const i = this.index(x, y), material = this.nameAt(i);
          if (material === "air") return null;
          return {
            material,
            temperature: this.temperature[i],
            fuel: this.fuel[i],
            life: this.life[i],
            burning: Boolean(this.flags[i] & FLAG_BURNING),
            emission: MATERIALS[material]?.emission || 0
          };
        }
        set(x, y, material, state = {}) {
          if (!this.inBounds(x, y)) return false;
          if (material !== "air" && this.externalSolid?.(x, y)) return false;
          const i = this.index(x, y), id = MATERIAL_IDS[material];
          if (id === void 0) throw new Error(`Unknown dense material: ${material}`);
          const previous = this.nameAt(i);
          const wasOccupied = this.material[i] !== 0;
          const willOccupied = id !== 0;
          if (!wasOccupied && willOccupied) this.occupiedCount++;
          if (wasOccupied && !willOccupied) this.occupiedCount--;
          if ((MATERIALS[previous]?.emission || 0) > 0) this.emissiveCount--;
          if ((MATERIALS[material]?.emission || 0) > 0) this.emissiveCount++;
          this.material[i] = id;
          if (material === "air") {
            this.temperature[i] = AMBIENT_TEMPERATURE;
            this.fuel[i] = 0;
            this.life[i] = 0;
            this.flags[i] = 0;
          } else {
            const def = MATERIALS[material] || {};
            this.temperature[i] = Number.isFinite(state.temperature) ? Math.round(state.temperature) : Math.round(def.temperature ?? AMBIENT_TEMPERATURE);
            this.fuel[i] = Number.isFinite(state.fuel) ? Math.max(0, Math.round(state.fuel)) : def.fuel || 0;
            this.life[i] = Number.isFinite(state.life) ? Math.max(0, Math.round(state.life)) : def.life || 0;
            this.flags[i] = def.ignition && state.burning ? FLAG_BURNING : 0;
          }
          this.wake(x, y);
          return true;
        }
        wake(x, y) {
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox, ny = y + oy;
            if (!this.inBounds(nx, ny)) continue;
            const i = this.index(nx, ny);
            const target = this.stepping ? this.nextActive : this.active;
            const list = this.stepping ? this.nextList : this.activeList;
            if (target[i]) continue;
            target[i] = 1;
            list.push(i);
          }
        }
        emit(type, data = {}) {
          this.events.push({ type, tick: this.tick, ...data });
        }
        drainEvents() {
          const out = this.events;
          this.events = [];
          return out;
        }
        _coords(i) {
          return [i % this.width, Math.floor(i / this.width)];
        }
        _activateNext(i) {
          if (i < 0 || i >= this.size || this.nextActive[i]) return;
          this.nextActive[i] = 1;
          this.nextList.push(i);
        }
        _wakeNext(x, y) {
          for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox, ny = y + oy;
            if (this.inBounds(nx, ny)) this._activateNext(this.index(nx, ny));
          }
        }
        _copyCell(from, to) {
          this.material[to] = this.material[from];
          this.temperature[to] = this.temperature[from];
          this.fuel[to] = this.fuel[from];
          this.life[to] = this.life[from];
          this.flags[to] = this.flags[from];
        }
        _clearCell(i) {
          this.material[i] = 0;
          this.temperature[i] = AMBIENT_TEMPERATURE;
          this.fuel[i] = 0;
          this.life[i] = 0;
          this.flags[i] = 0;
        }
        _move(x, y, nx, ny) {
          if (this.blocked(nx, ny)) return false;
          const a = this.index(x, y), b = this.index(nx, ny);
          if (!this.material[a] || this.material[b]) return false;
          const material = this.nameAt(a);
          this._copyCell(a, b);
          this._clearCell(a);
          this._wakeNext(x, y);
          this._wakeNext(nx, ny);
          if (this.emitMoves) this.emit("move", { material, from: [x, y, 0], to: [nx, ny, 0] });
          return true;
        }
        _swap(x, y, nx, ny) {
          if (!this.inBounds(nx, ny)) return false;
          const a = this.index(x, y), b = this.index(nx, ny);
          if (!this.material[a] || !this.material[b]) return false;
          const tmp = [
            this.material[a],
            this.temperature[a],
            this.fuel[a],
            this.life[a],
            this.flags[a]
          ];
          this._copyCell(b, a);
          this.material[b] = tmp[0];
          this.temperature[b] = tmp[1];
          this.fuel[b] = tmp[2];
          this.life[b] = tmp[3];
          this.flags[b] = tmp[4];
          this._wakeNext(x, y);
          this._wakeNext(nx, ny);
          return true;
        }
        _canDisplace(a, b) {
          const am = ID_TO_MATERIAL[this.material[a]];
          const bm = ID_TO_MATERIAL[this.material[b]];
          const ad = MATERIALS[am], bd = MATERIALS[bm];
          return ad && bd && ["powder", "liquid"].includes(ad.phase) && ["liquid", "gas"].includes(bd.phase) && ad.density > bd.density;
        }
        _tryMove(x, y, nx, ny) {
          if (this.blocked(nx, ny)) return false;
          const a = this.index(x, y), b = this.index(nx, ny);
          if (!this.material[b]) return this._move(x, y, nx, ny);
          return this._canDisplace(a, b) ? this._swap(x, y, nx, ny) : false;
        }
        _sideOrder(x, y) {
          return hash32(`${this.seed}:${this.tick}:${x}:${y}`) & 1 ? [1, -1] : [-1, 1];
        }
        _nearMaterial(x, y, name) {
          const id = MATERIAL_IDS[name];
          return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => {
            const nx = x + dx, ny = y + dy;
            return this.inBounds(nx, ny) && this.material[this.index(nx, ny)] === id;
          });
        }
        _lavaWater(x, y, i) {
          if (this.material[i] !== MATERIAL_IDS.lava) return false;
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (!this.inBounds(nx, ny)) continue;
            const n = this.index(nx, ny);
            if (this.material[n] !== MATERIAL_IDS.water) continue;
            this.set(x, y, "stone", { temperature: 260 });
            this.set(nx, ny, "steam", { temperature: 140, life: 12 });
            this.emit("reaction", { reaction: "lava-water", at: [x, y, 0], other: [nx, ny, 0] });
            return true;
          }
          return false;
        }
        _phase(x, y, i) {
          const id = this.material[i];
          if (id === MATERIAL_IDS.water && this.temperature[i] >= 100) {
            this.emit("phase-change", { from: "water", to: "steam", at: [x, y, 0] });
            this.set(x, y, "steam", { temperature: this.temperature[i], life: 12 });
            return true;
          }
          if (id === MATERIAL_IDS.steam && this.temperature[i] <= 82) {
            this.emit("phase-change", { from: "steam", to: "water", at: [x, y, 0] });
            this.set(x, y, "water", { temperature: this.temperature[i] });
            return true;
          }
          return false;
        }
        _igniteNeighbors(x, y) {
          for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, ny = y + dy;
            if (!this.inBounds(nx, ny)) continue;
            const i = this.index(nx, ny), name = this.nameAt(i), def = MATERIALS[name];
            if (!def?.ignition) continue;
            if (!(this.flags[i] & FLAG_BURNING)) this.emit("ignite", { material: name, at: [nx, ny, 0] });
            this.flags[i] |= FLAG_BURNING;
            this.temperature[i] = Math.max(this.temperature[i], def.ignition + 120);
            this._wakeNext(nx, ny);
          }
        }
        _fire(x, y, i) {
          this._igniteNeighbors(x, y);
          this.life[i] = Math.max(0, this.life[i] - 1);
          if (this.life[i] === 0) {
            this.set(x, y, "air");
            return true;
          }
          if (this._tryMove(x, y, x, y + 1)) return true;
          for (const dx of this._sideOrder(x, y)) {
            if (this._tryMove(x, y, x + dx, y)) return true;
          }
          this._wakeNext(x, y);
          return true;
        }
        _combust(x, y, i) {
          const name = this.nameAt(i), def = MATERIALS[name];
          if (!def?.ignition) return false;
          const hot = this._nearMaterial(x, y, "fire") || this._nearMaterial(x, y, "lava");
          if (!(this.flags[i] & FLAG_BURNING) && (hot || this.temperature[i] >= def.ignition)) {
            this.flags[i] |= FLAG_BURNING;
            this.emit("ignite", { material: name, at: [x, y, 0] });
          }
          if (!(this.flags[i] & FLAG_BURNING)) return false;
          this.fuel[i] = Math.max(0, this.fuel[i] - 1);
          this.temperature[i] = Math.max(this.temperature[i], 500);
          if (this.inBounds(x, y + 1) && !this.material[this.index(x, y + 1)]) {
            this.set(x, y + 1, "fire");
          }
          if (this.fuel[i] === 0) {
            this.set(x, y, name === "wood" ? "ash" : "air", { temperature: 160 });
            return true;
          }
          this._wakeNext(x, y);
          return true;
        }
        _mobile(x, y, i) {
          const name = this.nameAt(i), phase = MATERIALS[name]?.phase;
          const sides = this._sideOrder(x, y);
          if (phase === "powder") {
            if (this._tryMove(x, y, x, y - 1)) return true;
            for (const dx of sides) if (this._tryMove(x, y, x + dx, y - 1)) return true;
          } else if (phase === "liquid") {
            if (this._tryMove(x, y, x, y - 1)) return true;
            for (const dx of sides) if (this._tryMove(x, y, x + dx, y)) return true;
          } else if (phase === "gas") {
            if (this._tryMove(x, y, x, y + 1)) return true;
            for (const dx of sides) if (this._tryMove(x, y, x + dx, y)) return true;
          }
          return false;
        }
        _cool(i, x, y) {
          const name = this.nameAt(i), def = MATERIALS[name];
          if (!def) return false;
          const before = this.temperature[i];
          if (Math.abs(before - AMBIENT_TEMPERATURE) < 1) return false;
          const next = before + (AMBIENT_TEMPERATURE - before) * (def.conductivity || 0.03) * 0.12;
          this.temperature[i] = Math.round(next);
          if (this.temperature[i] === before) return false;
          this._wakeNext(x, y);
          return true;
        }
        _process(i) {
          if (!this.material[i]) return false;
          const [x, y] = this._coords(i);
          if (this._lavaWater(x, y, i)) return true;
          if (this._phase(x, y, i)) return true;
          if (this.material[i] === MATERIAL_IDS.fire) return this._fire(x, y, i);
          let changed = this._combust(x, y, i);
          if (!this.material[i]) return true;
          if (this._mobile(x, y, i)) return true;
          if (this._cool(i, x, y)) changed = true;
          return changed;
        }
        step(options = {}) {
          const maxCells = Math.max(1, Number(options.maxCells) || this.size);
          const queue = this.activeList;
          this.activeList = [];
          this.active.fill(0);
          this.stepping = true;
          this.nextList = [];
          this.nextActive.fill(0);
          let processed = 0, changed = 0;
          for (const i of queue) {
            if (processed >= maxCells) {
              this._activateNext(i);
              continue;
            }
            if (!this.material[i]) continue;
            processed++;
            if (this._process(i)) changed++;
          }
          this.activeList = this.nextList;
          this.active.set(this.nextActive);
          this.nextList = [];
          this.stepping = false;
          this.tick++;
          return this.stats({ processed, changed });
        }
        stats(extra = {}) {
          return {
            tick: this.tick,
            width: this.width,
            height: this.height,
            occupied: this.occupiedCount,
            active: this.activeList.length,
            emissive: this.emissiveCount,
            ...extra
          };
        }
        forEachCell(fn) {
          for (let i = 0; i < this.size; i++) {
            if (!this.material[i]) continue;
            const [x, y] = this._coords(i);
            fn(x, y, this.get(x, y), i);
          }
        }
      };
      module.exports = {
        DenseMatterGrid,
        MATERIAL_IDS,
        ID_TO_MATERIAL,
        FLAG_BURNING
      };
    }
  });

  // lib/world-matter-structure.js
  var require_world_matter_structure = __commonJS({
    "lib/world-matter-structure.js"(exports, module) {
      "use strict";
      var { MATERIALS, key } = require_world_matter_engine();
      var DIRS = Object.freeze([
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1]
      ]);
      function parsePosition(value) {
        return value.split(",").map(Number);
      }
      function isStructural(cell) {
        return Boolean(cell && MATERIALS[cell.material]?.structural);
      }
      function structuralPositions(world) {
        const out = /* @__PURE__ */ new Set();
        for (const [position, cell] of world.cells) {
          if (isStructural(cell)) out.add(position);
        }
        return out;
      }
      function neighborsOf(position) {
        const [x, y, z] = parsePosition(position);
        return DIRS.map(([dx, dy, dz]) => key(x + dx, y + dy, z + dz));
      }
      function findSupported(world, options = {}) {
        const groundY = Number.isFinite(options.groundY) ? options.groundY : 0;
        const isAnchor = typeof options.isAnchor === "function" ? options.isAnchor : ((x, y) => y <= groundY);
        const structural = structuralPositions(world);
        const supported = /* @__PURE__ */ new Set();
        const queue = [];
        for (const position of structural) {
          const [x, y, z] = parsePosition(position);
          const cell = world.cells.get(position);
          if (!isAnchor(x, y, z, cell)) continue;
          supported.add(position);
          queue.push(position);
        }
        for (let head = 0; head < queue.length; head++) {
          const position = queue[head];
          for (const next of neighborsOf(position)) {
            if (!structural.has(next) || supported.has(next)) continue;
            supported.add(next);
            queue.push(next);
          }
        }
        return { structural, supported };
      }
      function findUnsupportedClusters(world, options = {}) {
        const { structural, supported } = findSupported(world, options);
        const pending = new Set([...structural].filter((p) => !supported.has(p)));
        const clusters = [];
        while (pending.size) {
          const start = pending.values().next().value;
          const cells = [];
          const queue = [start];
          pending.delete(start);
          for (let head = 0; head < queue.length; head++) {
            const position = queue[head];
            cells.push(position);
            for (const next of neighborsOf(position)) {
              if (!pending.has(next)) continue;
              pending.delete(next);
              queue.push(next);
            }
          }
          clusters.push(cells);
        }
        clusters.sort((a, b) => b.length - a.length);
        return clusters;
      }
      function makeRigidCluster(world, positions, id) {
        const absolute = positions.map((position) => {
          const [x, y, z] = parsePosition(position);
          return { x, y, z, cell: { ...world.cells.get(position) } };
        });
        const center = absolute.reduce((a, p) => ({
          x: a.x + p.x,
          y: a.y + p.y,
          z: a.z + p.z
        }), { x: 0, y: 0, z: 0 });
        const n = Math.max(1, absolute.length);
        center.x /= n;
        center.y /= n;
        center.z /= n;
        return {
          id,
          position: { ...center },
          velocity: { x: 0, y: 0, z: 0 },
          angle: 0,
          angularVelocity: 0,
          cells: absolute.map((p) => ({
            x: p.x - center.x,
            y: p.y - center.y,
            z: p.z - center.z,
            cell: p.cell
          })),
          settled: false
        };
      }
      function detachUnsupported(world, options = {}) {
        const minCells = Math.max(1, Number(options.minCells) || 2);
        const clusters = findUnsupportedClusters(world, options).filter((cells) => cells.length >= minCells);
        const detached = [];
        let serial = Number(options.serial) || 1;
        for (const positions of clusters) {
          const cluster = makeRigidCluster(world, positions, serial++);
          for (const position of positions) {
            const [x, y, z] = parsePosition(position);
            world.setCell(x, y, z, "air");
          }
          world._emit?.("detach", {
            clusterId: cluster.id,
            count: cluster.cells.length,
            at: [cluster.position.x, cluster.position.y, cluster.position.z]
          });
          detached.push(cluster);
        }
        return detached;
      }
      function applyDamage(world, x, y, z, amount = 1, radius = 0) {
        const broken = [];
        const r = Math.max(0, Math.floor(radius));
        for (let dx = -r; dx <= r; dx++) for (let dy = -r; dy <= r; dy++) {
          for (let dz = -r; dz <= r; dz++) {
            if (dx * dx + dy * dy + dz * dz > r * r) continue;
            const px = x + dx, py = y + dy, pz = z + dz;
            const cell = world.getCell(px, py, pz);
            if (!cell || !isStructural(cell)) continue;
            cell.integrity = Math.max(0, (cell.integrity ?? 1) - amount);
            if (cell.integrity <= 0) {
              world.setCell(px, py, pz, "air");
              world._emit?.("fracture", { material: cell.material, at: [px, py, pz] });
              broken.push([px, py, pz]);
            } else {
              world.setCell(px, py, pz, cell.material, cell);
            }
          }
        }
        return broken;
      }
      function rotateCell(cell, angle) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return {
          x: cell.x * c - cell.y * s,
          y: cell.x * s + cell.y * c,
          z: cell.z,
          cell: cell.cell
        };
      }
      function worldCellsForCluster(cluster, position = cluster.position) {
        return cluster.cells.map((cell) => {
          const p = rotateCell(cell, cluster.angle);
          return {
            x: Math.round(position.x + p.x),
            y: Math.round(position.y + p.y),
            z: Math.round(position.z + p.z),
            cell: p.cell
          };
        });
      }
      var RigidClusterSystem = class {
        constructor(options = {}) {
          this.gravity = Number.isFinite(options.gravity) ? options.gravity : -22;
          this.maxFallSpeed = Number(options.maxFallSpeed) || 34;
          this.shatterSpeed = Number(options.shatterSpeed) || 13;
          this.clusters = [];
          this.nextId = 1;
        }
        detach(world, options = {}) {
          const found = detachUnsupported(world, {
            ...options,
            serial: this.nextId
          });
          this.nextId += found.length;
          for (const cluster of found) {
            const sign = cluster.id % 2 ? 1 : -1;
            cluster.angularVelocity = sign * Math.min(0.9, 0.08 + cluster.cells.length * 3e-3);
            this.clusters.push(cluster);
          }
          return found;
        }
        _collides(world, cluster, position, externalSolid) {
          for (const p of worldCellsForCluster(cluster, position)) {
            if (world.cells.has(key(p.x, p.y, p.z))) return true;
            if (externalSolid?.(p.x, p.y, p.z)) return true;
          }
          return false;
        }
        _settle(world, cluster, shatter = false) {
          const placed = /* @__PURE__ */ new Set();
          for (const p of worldCellsForCluster(cluster)) {
            let y = p.y;
            while (world.cells.has(key(p.x, y, p.z)) && y < p.y + 8) y++;
            if (placed.has(key(p.x, y, p.z))) continue;
            placed.add(key(p.x, y, p.z));
            const material = shatter && p.cell.material === "stone" ? "sand" : p.cell.material;
            world.setCell(p.x, y, p.z, material, p.cell);
          }
          cluster.settled = true;
          world._emit?.(shatter ? "cluster-shatter" : "cluster-settle", {
            clusterId: cluster.id,
            count: cluster.cells.length,
            at: [cluster.position.x, cluster.position.y, cluster.position.z]
          });
        }
        step(world, dt = 1 / 60, externalSolid) {
          const active = [];
          for (const cluster of this.clusters) {
            if (cluster.settled) continue;
            cluster.velocity.y = Math.max(
              -this.maxFallSpeed,
              cluster.velocity.y + this.gravity * dt
            );
            const next = {
              x: cluster.position.x + cluster.velocity.x * dt,
              y: cluster.position.y + cluster.velocity.y * dt,
              z: cluster.position.z + cluster.velocity.z * dt
            };
            cluster.angle += cluster.angularVelocity * dt;
            if (this._collides(world, cluster, next, externalSolid)) {
              const speed = Math.abs(cluster.velocity.y);
              this._settle(world, cluster, speed >= this.shatterSpeed);
              continue;
            }
            cluster.position = next;
            active.push(cluster);
          }
          this.clusters = active;
          return this.clusters.length;
        }
        renderSnapshot() {
          return this.clusters.map((cluster) => ({
            id: cluster.id,
            angle: cluster.angle,
            position: { ...cluster.position },
            cells: worldCellsForCluster(cluster).map((p) => ({
              x: p.x,
              y: p.y,
              z: p.z,
              material: p.cell.material
            }))
          }));
        }
      };
      module.exports = {
        isStructural,
        findSupported,
        findUnsupportedClusters,
        detachUnsupported,
        applyDamage,
        worldCellsForCluster,
        RigidClusterSystem
      };
    }
  });

  // lib/world-matter-camera.js
  var require_world_matter_camera = __commonJS({
    "lib/world-matter-camera.js"(exports, module) {
      "use strict";
      var MatterCamera = class {
        constructor(options = {}) {
          this.x = Number(options.x) || 0;
          this.y = Number(options.y) || 0;
          this.zoom = Number(options.zoom) || 1;
          this.target = { x: this.x, y: this.y, zoom: this.zoom };
          this.viewport = { width: Number(options.width) || 640, height: Number(options.height) || 360 };
          this.baseCellPixels = Number(options.baseCellPixels) || 3;
          this.pixelPerfect = options.pixelPerfect !== false;
          this.shakeTime = 0;
          this.shakePower = 0;
          this.shakeOffset = { x: 0, y: 0 };
        }
        resize(width, height) {
          this.viewport.width = Math.max(1, width);
          this.viewport.height = Math.max(1, height);
        }
        cutTo(x, y, zoom = this.zoom) {
          this.x = x;
          this.y = y;
          this.zoom = zoom;
          this.target = { x, y, zoom };
        }
        animateTo(x, y, zoom = this.zoom) {
          this.target = { x, y, zoom };
        }
        shake(power = 0.8, duration = 0.18) {
          this.shakePower = Math.max(this.shakePower, power);
          this.shakeTime = Math.max(this.shakeTime, duration);
        }
        update(dt) {
          const k = 1 - Math.pow(1e-3, Math.max(0, dt));
          this.x += (this.target.x - this.x) * k;
          this.y += (this.target.y - this.y) * k;
          this.zoom += (this.target.zoom - this.zoom) * k;
          if (this.shakeTime > 0) {
            this.shakeTime = Math.max(0, this.shakeTime - dt);
            const t = this.shakeTime * 91.7;
            this.shakeOffset.x = Math.sin(t * 2.13) * this.shakePower;
            this.shakeOffset.y = Math.cos(t * 2.71) * this.shakePower;
            this.shakePower *= Math.pow(0.04, dt);
          } else {
            this.shakeOffset.x = 0;
            this.shakeOffset.y = 0;
          }
        }
        cellPixels() {
          const raw = this.baseCellPixels * this.zoom;
          return this.pixelPerfect ? Math.max(1, Math.round(raw)) : Math.max(0.25, raw);
        }
        worldToScreen(x, y) {
          const scale = this.cellPixels();
          return {
            x: this.viewport.width / 2 + (x - this.x + this.shakeOffset.x) * scale,
            y: this.viewport.height / 2 - (y - this.y + this.shakeOffset.y) * scale
          };
        }
        screenToWorld(x, y) {
          const scale = this.cellPixels();
          return {
            x: (x - this.viewport.width / 2) / scale + this.x - this.shakeOffset.x,
            y: (this.viewport.height / 2 - y) / scale + this.y - this.shakeOffset.y
          };
        }
        visibleBounds(padding = 2) {
          const scale = this.cellPixels();
          const hw = this.viewport.width / (2 * scale) + padding;
          const hh = this.viewport.height / (2 * scale) + padding;
          return {
            minX: Math.floor(this.x - hw),
            maxX: Math.ceil(this.x + hw),
            minY: Math.floor(this.y - hh),
            maxY: Math.ceil(this.y + hh)
          };
        }
      };
      module.exports = { MatterCamera };
    }
  });

  // lib/world-matter-particles.js
  var require_world_matter_particles = __commonJS({
    "lib/world-matter-particles.js"(exports, module) {
      "use strict";
      function hash32(value) {
        let h = 2166136261;
        for (const ch of String(value)) {
          h ^= ch.charCodeAt(0);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      }
      function unit(seed) {
        return (hash32(seed) & 16777215) / 16777215;
      }
      var PRESETS = Object.freeze({
        spark: { life: 0.42, speed: 10, gravity: -5, size: 0.65, color: "#ffe66d", blend: "lighter" },
        ember: { life: 0.85, speed: 5, gravity: 2, size: 0.75, color: "#ff7a32", blend: "lighter" },
        cross: { life: 1.2, speed: 3, gravity: 0, size: 1.1, color: "#d8ff55", blend: "lighter" },
        smoke: { life: 1.5, speed: 1.8, gravity: 1.4, size: 1.5, color: "#9aa3ad", blend: "source-over" },
        steam: { life: 1.1, speed: 2.5, gravity: 2.2, size: 1.1, color: "#d9f2ff", blend: "source-over" },
        debris: { life: 0.9, speed: 7, gravity: -16, size: 0.8, color: "#9b8a74", blend: "source-over" },
        droplet: { life: 0.75, speed: 5, gravity: -12, size: 0.6, color: "#7cc8ff", blend: "source-over" }
      });
      var MatterParticleSystem = class {
        constructor(options = {}) {
          this.max = Math.max(32, Number(options.max) || 1800);
          this.seed = Number(options.seed) || 1;
          this.serial = 0;
          this.particles = [];
        }
        _rand(tag) {
          return unit(`${this.seed}:${this.serial}:${tag}`);
        }
        emit(type, x, y, count = 1, options = {}) {
          const preset = PRESETS[type] || PRESETS.spark;
          const n = Math.min(count, Math.max(0, this.max - this.particles.length));
          for (let i = 0; i < n; i++) {
            this.serial++;
            const a = (this._rand("a") * 2 - 1) * (options.spread ?? Math.PI);
            const speed = (options.speed ?? preset.speed) * (0.45 + this._rand("s") * 0.8);
            const upward = options.upward ?? 0;
            this.particles.push({
              type,
              x,
              y,
              vx: Math.cos(a) * speed + (options.vx || 0),
              vy: Math.sin(a) * speed + upward + (options.vy || 0),
              life: (options.life ?? preset.life) * (0.7 + this._rand("l") * 0.6),
              maxLife: options.life ?? preset.life,
              gravity: options.gravity ?? preset.gravity,
              size: (options.size ?? preset.size) * (0.7 + this._rand("z") * 0.6),
              color: options.color || preset.color,
              blend: options.blend || preset.blend,
              rotation: this._rand("r") * Math.PI,
              spin: (this._rand("p") * 2 - 1) * 4
            });
          }
        }
        consume(events = []) {
          for (const e of events) {
            const p = e.at || e.other;
            if (!p) continue;
            const [x, y] = p;
            if (e.type === "ignite") {
              this.emit("ember", x, y, 5, { upward: 3, spread: 2.4 });
              this.emit("spark", x, y, 3, { upward: 4 });
            } else if (e.type === "reaction" && e.reaction === "lava-water") {
              this.emit("steam", x, y, 14, { upward: 4, spread: 1.5 });
              this.emit("spark", x, y, 9, { upward: 5 });
            } else if (e.type === "phase-change" && e.to === "steam") {
              this.emit("steam", x, y, 5, { upward: 2 });
            } else if (e.type === "fracture") {
              this.emit("debris", x, y, 8, { upward: 4 });
            } else if (e.type === "detach") {
              this.emit("debris", x, y, Math.min(18, Math.max(5, e.count || 5)), { upward: 2 });
            } else if (e.type === "cluster-shatter") {
              this.emit("debris", x, y, 22, { upward: 7, speed: 10 });
            }
          }
        }
        ambientFromMatter(source, budget = 8) {
          let emitted = 0;
          if (!source?.forEachCell) return;
          source.forEachCell((x, y, cell) => {
            if (emitted >= budget) return;
            if (cell.material === "fire") {
              this.emit("ember", x, y, 1, { upward: 2.5, spread: 1 });
              emitted++;
            } else if (cell.material === "lava" && this.serial % 3 === 0) {
              this.emit("spark", x, y, 1, { upward: 1.5, spread: 0.8 });
              emitted++;
            }
          });
        }
        step(dt) {
          const alive = [];
          for (const p of this.particles) {
            p.life -= dt;
            if (p.life <= 0) continue;
            p.vy += p.gravity * dt;
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.rotation += p.spin * dt;
            alive.push(p);
          }
          this.particles = alive;
          return alive.length;
        }
        draw(ctx, camera) {
          ctx.save();
          for (const p of this.particles) {
            const q = camera.worldToScreen(p.x, p.y);
            const alpha = Math.max(0, Math.min(1, p.life / Math.max(1e-3, p.maxLife)));
            const s = Math.max(1, p.size * camera.cellPixels());
            ctx.globalCompositeOperation = p.blend;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            if (p.type === "cross") {
              ctx.fillRect(q.x - s * 0.18, q.y - s, s * 0.36, s * 2);
              ctx.fillRect(q.x - s, q.y - s * 0.18, s * 2, s * 0.36);
            } else {
              ctx.beginPath();
              ctx.arc(q.x, q.y, s * 0.45, 0, Math.PI * 2);
              ctx.fill();
            }
          }
          ctx.restore();
        }
        stats() {
          return { count: this.particles.length, max: this.max };
        }
      };
      module.exports = { MatterParticleSystem, PRESETS };
    }
  });

  // lib/world-matter-renderer.js
  var require_world_matter_renderer = __commonJS({
    "lib/world-matter-renderer.js"(exports, module) {
      "use strict";
      var { MATERIALS } = require_world_matter_engine();
      var PALETTE = Object.freeze({
        stone: ["#586474", "#657385", "#748294"],
        sand: ["#d5ad55", "#e7c86f", "#f0d885"],
        water: ["#2d79cf", "#3f99ed", "#67b8ff"],
        oil: ["#5c4728", "#765a31", "#8c6b39"],
        wood: ["#7b3f25", "#9b5730", "#b86c3b"],
        steam: ["#b9cfda", "#d7e9ef", "#eef8fb"],
        fire: ["#ff4a1f", "#ff8a32", "#ffe071"],
        lava: ["#e83218", "#ff4b24", "#ff9a2b"],
        ash: ["#555b62", "#6b7279", "#858b91"]
      });
      function hashColorIndex(x, y, name) {
        let h = x * 73856093 ^ y * 19349663;
        for (let i = 0; i < name.length; i++) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
        return Math.abs(h) % 3;
      }
      var MatterPixelRenderer = class {
        constructor(canvas, camera, options = {}) {
          if (!canvas) throw new Error("MatterPixelRenderer needs a canvas");
          this.canvas = canvas;
          this.ctx = canvas.getContext("2d", { alpha: false });
          this.camera = camera;
          this.background = options.background || "#07101a";
          this.lightBudget = Math.max(8, Number(options.lightBudget) || 180);
          this.glowCanvas = document.createElement("canvas");
          this.glowCtx = this.glowCanvas.getContext("2d");
          this.lastStats = { cells: 0, emissive: 0, lights: 0 };
          this.resize(canvas.clientWidth || canvas.width || 640, canvas.clientHeight || canvas.height || 360);
        }
        resize(width, height, dpr = Math.min(devicePixelRatio || 1, 2)) {
          this.width = Math.max(1, Math.round(width));
          this.height = Math.max(1, Math.round(height));
          this.dpr = dpr;
          this.canvas.width = Math.round(this.width * dpr);
          this.canvas.height = Math.round(this.height * dpr);
          this.canvas.style.width = this.width + "px";
          this.canvas.style.height = this.height + "px";
          this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          this.glowCanvas.width = Math.round(this.width * dpr);
          this.glowCanvas.height = Math.round(this.height * dpr);
          this.glowCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
          this.camera.resize(this.width, this.height);
        }
        _style(cell, x, y) {
          const colors = PALETTE[cell.material] || ["#fff", "#ddd", "#bbb"];
          return colors[hashColorIndex(x, y, cell.material)];
        }
        _drawCell(ctx, x, y, cell, alpha = 1) {
          const scale = this.camera.cellPixels();
          const p = this.camera.worldToScreen(x, y + 1);
          const px = Math.floor(p.x), py = Math.floor(p.y);
          ctx.globalAlpha = alpha;
          ctx.fillStyle = this._style(cell, x, y);
          ctx.fillRect(px, py, Math.ceil(scale + 0.25), Math.ceil(scale + 0.25));
          ctx.globalAlpha = 1;
        }
        _drawEmitter(x, y, cell, index) {
          const emission = Math.max(cell.emission || 0, MATERIALS[cell.material]?.emission || 0);
          if (emission <= 0) return 0;
          const g = this.glowCtx;
          const scale = this.camera.cellPixels();
          const p = this.camera.worldToScreen(x + 0.5, y + 0.5);
          const r = scale * (cell.material === "fire" ? 5.5 : 4.2);
          g.globalCompositeOperation = "lighter";
          g.globalAlpha = Math.min(1, 0.22 + emission * 0.45);
          g.fillStyle = this._style(cell, x, y);
          g.fillRect(
            Math.floor(p.x - scale * 0.5),
            Math.floor(p.y - scale * 0.5),
            Math.ceil(scale),
            Math.ceil(scale)
          );
          if (index >= this.lightBudget) return 0;
          const grad = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          grad.addColorStop(0, cell.material === "fire" ? "rgba(255,185,75,.26)" : "rgba(255,83,25,.24)");
          grad.addColorStop(0.45, cell.material === "fire" ? "rgba(255,92,28,.12)" : "rgba(255,62,18,.10)");
          grad.addColorStop(1, "rgba(0,0,0,0)");
          g.fillStyle = grad;
          g.beginPath();
          g.arc(p.x, p.y, r, 0, Math.PI * 2);
          g.fill();
          return 1;
        }
        _iterate(source, fn) {
          if (Array.isArray(source)) {
            for (const layer of source) this._iterate(layer, fn);
            return;
          }
          if (source?.forEachCell) {
            source.forEachCell((x, y, cell) => fn(x, y, cell));
            return;
          }
          if (source?.snapshot) {
            for (const item of source.snapshot()) {
              const [x, y, z] = item.position.split(",").map(Number);
              if (z === 0) fn(x, y, item);
            }
          }
        }
        _drawRigid(rigid) {
          if (!rigid?.renderSnapshot) return;
          for (const cluster of rigid.renderSnapshot()) {
            for (const cell of cluster.cells) {
              const fake = { material: cell.material, emission: MATERIALS[cell.material]?.emission || 0 };
              this._drawCell(this.ctx, cell.x, cell.y, fake);
            }
          }
        }
        render(source, options = {}) {
          const ctx = this.ctx, g = this.glowCtx;
          ctx.imageSmoothingEnabled = false;
          ctx.fillStyle = this.background;
          ctx.fillRect(0, 0, this.width, this.height);
          g.clearRect(0, 0, this.width, this.height);
          let cells = 0, emissive = 0, lights = 0;
          this._iterate(source, (x, y, cell) => {
            const bounds = this.camera.visibleBounds(3);
            if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return;
            const alpha = cell.material === "steam" ? 0.48 : cell.material === "water" ? 0.88 : 1;
            this._drawCell(ctx, x, y, cell, alpha);
            cells++;
            if ((cell.emission || MATERIALS[cell.material]?.emission || 0) > 0) {
              emissive++;
              lights += this._drawEmitter(x, y, cell, lights);
            }
            if (cell.burning && cell.material !== "fire") {
              const p = this.camera.worldToScreen(x + 0.5, y + 1);
              ctx.fillStyle = "#ffd75a";
              ctx.fillRect(
                Math.floor(p.x - this.camera.cellPixels() * 0.2),
                Math.floor(p.y - this.camera.cellPixels() * 0.35),
                Math.max(1, Math.ceil(this.camera.cellPixels() * 0.4)),
                Math.max(1, Math.ceil(this.camera.cellPixels() * 0.35))
              );
            }
          });
          this._drawRigid(options.rigid);
          ctx.save();
          ctx.globalCompositeOperation = "lighter";
          ctx.globalAlpha = 0.95;
          ctx.filter = `blur(${Math.max(2, this.camera.cellPixels() * 1.7)}px)`;
          ctx.drawImage(this.glowCanvas, 0, 0, this.width, this.height);
          ctx.restore();
          if (options.particles) options.particles.draw(ctx, this.camera);
          if (Array.isArray(options.entities)) {
            for (const entity of options.entities) entity.draw?.(ctx, this.camera);
          }
          this.lastStats = { cells, emissive, lights };
          return this.lastStats;
        }
      };
      module.exports = { MatterPixelRenderer, PALETTE };
    }
  });

  // lib/world-sprite-runtime.js
  var require_world_sprite_runtime = __commonJS({
    "lib/world-sprite-runtime.js"(exports, module) {
      "use strict";
      var SpriteAnimator = class {
        constructor(options = {}) {
          this.image = options.image || null;
          this.frameWidth = Math.max(1, Number(options.frameWidth) || 16);
          this.frameHeight = Math.max(1, Number(options.frameHeight) || 24);
          this.clips = options.clips || { idle: { frames: [0], fps: 1, loop: true } };
          this.clipName = options.clip || Object.keys(this.clips)[0];
          this.frameIndex = 0;
          this.time = 0;
          this.x = Number(options.x) || 0;
          this.y = Number(options.y) || 0;
          this.scale = Number(options.scale) || 1;
          this.flipX = Boolean(options.flipX);
          this.anchorX = Number.isFinite(options.anchorX) ? options.anchorX : 0.5;
          this.anchorY = Number.isFinite(options.anchorY) ? options.anchorY : 0;
          this.drawFrame = typeof options.drawFrame === "function" ? options.drawFrame : null;
        }
        play(name, restart = false) {
          if (!this.clips[name]) return false;
          if (name !== this.clipName || restart) {
            this.clipName = name;
            this.frameIndex = 0;
            this.time = 0;
          }
          return true;
        }
        update(dt) {
          const clip = this.clips[this.clipName];
          if (!clip || clip.frames.length < 2 || !clip.fps) return;
          this.time += Math.max(0, dt);
          const frameTime = 1 / clip.fps;
          while (this.time >= frameTime) {
            this.time -= frameTime;
            if (this.frameIndex < clip.frames.length - 1) this.frameIndex++;
            else if (clip.loop !== false) this.frameIndex = 0;
          }
        }
        currentFrame() {
          const clip = this.clips[this.clipName];
          return clip?.frames?.[this.frameIndex] ?? 0;
        }
        draw(ctx, camera) {
          const frame = this.currentFrame();
          const p = camera.worldToScreen(this.x, this.y);
          const cell = camera.cellPixels() * this.scale;
          const dw = this.frameWidth * cell, dh = this.frameHeight * cell;
          ctx.save();
          ctx.imageSmoothingEnabled = false;
          ctx.translate(Math.round(p.x), Math.round(p.y));
          if (this.flipX) ctx.scale(-1, 1);
          const dx = -dw * this.anchorX, dy = -dh * (1 - this.anchorY);
          if (this.drawFrame) {
            this.drawFrame(ctx, frame, dx, dy, dw, dh, cell);
          } else if (this.image) {
            const cols = Math.max(1, Math.floor(this.image.width / this.frameWidth));
            const sx = frame % cols * this.frameWidth;
            const sy = Math.floor(frame / cols) * this.frameHeight;
            ctx.drawImage(
              this.image,
              sx,
              sy,
              this.frameWidth,
              this.frameHeight,
              Math.round(dx),
              Math.round(dy),
              Math.round(dw),
              Math.round(dh)
            );
          }
          ctx.restore();
        }
        state() {
          return {
            clip: this.clipName,
            frame: this.currentFrame(),
            frameIndex: this.frameIndex,
            x: this.x,
            y: this.y,
            flipX: this.flipX
          };
        }
      };
      var SpriteEntity = class {
        constructor(options = {}) {
          this.animator = options.animator || new SpriteAnimator(options);
          this.x = Number(options.x) || 0;
          this.y = Number(options.y) || 0;
          this.vx = 0;
          this.vy = 0;
          this.speed = Number(options.speed) || 8;
          this.jumpSpeed = Number(options.jumpSpeed) || 12;
          this.gravity = Number(options.gravity) || -28;
          this.onGround = false;
          this.aimAngle = 0;
          this.moveInput = 0;
        }
        move(direction) {
          this.moveInput = Math.max(-1, Math.min(1, Number(direction) || 0));
          if (this.moveInput) this.animator.flipX = this.moveInput < 0;
        }
        aim(angle) {
          this.aimAngle = Number(angle) || 0;
        }
        jump() {
          if (!this.onGround) return false;
          this.vy = this.jumpSpeed;
          this.onGround = false;
          return true;
        }
        update(dt, isSolid = () => false) {
          this.vx = this.moveInput * this.speed;
          this.vy += this.gravity * dt;
          const nx = this.x + this.vx * dt;
          if (!isSolid(Math.round(nx), Math.floor(this.y))) {
            this.x = nx;
          } else this.vx = 0;
          const ny = this.y + this.vy * dt;
          const footY = Math.floor(ny);
          if (this.vy <= 0 && isSolid(Math.round(this.x), footY)) {
            this.y = footY + 1;
            this.vy = 0;
            this.onGround = true;
          } else {
            this.y = ny;
            this.onGround = false;
          }
          this.animator.x = this.x;
          this.animator.y = this.y;
          const clip = this.onGround ? Math.abs(this.vx) > 0.1 ? "walk" : "idle" : "air";
          if (this.animator.clips[clip]) this.animator.play(clip);
          this.animator.update(dt);
        }
        draw(ctx, camera) {
          this.animator.draw(ctx, camera);
        }
      };
      module.exports = { SpriteAnimator, SpriteEntity };
    }
  });

  // lib/world-noita-runtime.js
  var require_world_noita_runtime = __commonJS({
    "lib/world-noita-runtime.js"(exports, module) {
      "use strict";
      var { MatterWorld, MATERIALS, key } = require_world_matter_engine();
      var { DenseMatterGrid } = require_world_matter_dense_grid();
      var { RigidClusterSystem } = require_world_matter_structure();
      var { MatterCamera } = require_world_matter_camera();
      var { MatterParticleSystem } = require_world_matter_particles();
      var NoitaRuntime = class {
        constructor(options = {}) {
          this.sparse = options.sparse || new MatterWorld({ seed: options.seed || 1 });
          this.dense = options.dense || new DenseMatterGrid(
            options.width || 256,
            options.height || 144,
            { seed: options.seed || 1 }
          );
          this.rigid = options.rigid || new RigidClusterSystem(options.rigidOptions);
          this.rigidMask = /* @__PURE__ */ new Set();
          this.dense.setExternalSolid((x, y) => {
            if (this.rigidMask.has(key(x, y, 0))) return true;
            const cell = this.sparse.cells.get(key(x, y, 0));
            return Boolean(cell && MATERIALS[cell.material]?.phase === "solid");
          });
          this.camera = options.camera || new MatterCamera(options.cameraOptions);
          this.particles = options.particles || new MatterParticleSystem({
            seed: options.seed || 1,
            max: options.maxParticles || 1800
          });
          this.time = 0;
          this.lastEvents = [];
          this.autoStructural = options.autoStructural !== false;
          this.structureInterval = Math.max(1, Number(options.structureInterval) || 6);
          this.structureMinCells = Math.max(1, Number(options.structureMinCells) || 2);
        }
        _crossLayerChemistry() {
          const hotIds = /* @__PURE__ */ new Set(["fire", "lava"]);
          for (const [position, cell] of this.sparse.cells) {
            const def = MATERIALS[cell.material];
            if (!def?.ignition) continue;
            const [x, y, z] = position.split(",").map(Number);
            if (z !== 0) continue;
            let hot = false;
            for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
              const denseCell = this.dense.get(x + dx, y + dy);
              if (denseCell && hotIds.has(denseCell.material)) {
                hot = true;
                break;
              }
            }
            if (!hot) continue;
            if (!cell.burning) this.sparse._emit?.("ignite", { material: cell.material, at: [x, y, z], source: "dense" });
            this.sparse.setCell(x, y, z, cell.material, {
              ...cell,
              burning: true,
              temperature: Math.max(cell.temperature || 20, def.ignition + 120)
            });
          }
        }
        _collectEvents() {
          const events = [
            ...this.sparse.drainEvents(),
            ...this.dense.drainEvents()
          ];
          this.particles.consume(events);
          for (const e of events) {
            if (e.type === "reaction") this.camera.shake(0.8, 0.16);
            if (e.type === "fracture") this.camera.shake(0.45, 0.12);
            if (e.type === "cluster-shatter") this.camera.shake(1.1, 0.22);
          }
          this.lastEvents = events;
          return events;
        }
        step(dt = 1 / 60, options = {}) {
          this._crossLayerChemistry();
          const sparse = this.sparse.step({
            maxCells: options.maxSparseCells || 5e4
          });
          const dense = this.dense.step({
            maxCells: options.maxDenseCells || 8e4
          });
          if (this.autoStructural && this.sparse.tick % this.structureInterval === 0) {
            this.rigid.detach(this.sparse, { minCells: this.structureMinCells });
          }
          this.rigid.step(this.sparse, dt, (x, y, z) => {
            if (z !== 0) return false;
            const cell = this.dense.get(x, y);
            const phase = cell && MATERIALS[cell.material]?.phase;
            return phase === "solid" || phase === "powder";
          });
          this.rigidMask = /* @__PURE__ */ new Set();
          for (const cluster of this.rigid.renderSnapshot()) {
            for (const cell of cluster.cells) this.rigidMask.add(key(cell.x, cell.y, cell.z));
          }
          const events = this._collectEvents();
          this.particles.ambientFromMatter(
            this.dense,
            options.ambientParticleBudget ?? 8
          );
          this.particles.step(dt);
          this.camera.update(dt);
          this.time += dt;
          return {
            time: this.time,
            sparse,
            dense,
            rigid: this.rigid.clusters.length,
            particles: this.particles.stats(),
            events: events.length
          };
        }
        renderSources() {
          return [this.dense, this.sparse];
        }
        detachUnsupported(options = {}) {
          const result = this.rigid.detach(this.sparse, options);
          this._collectEvents();
          return result;
        }
        cutTo(x, y, zoom) {
          this.camera.cutTo(x, y, zoom);
        }
        animateCamera(x, y, zoom) {
          this.camera.animateTo(x, y, zoom);
        }
        stats() {
          return {
            time: this.time,
            sparse: this.sparse.stats(),
            dense: this.dense.stats(),
            rigid: this.rigid.clusters.length,
            particles: this.particles.stats(),
            camera: {
              x: this.camera.x,
              y: this.camera.y,
              zoom: this.camera.zoom,
              cellPixels: this.camera.cellPixels()
            }
          };
        }
      };
      module.exports = { NoitaRuntime };
    }
  });

  // lib/world-noita-stack.js
  var require_world_noita_stack = __commonJS({
    "lib/world-noita-stack.js"(exports, module) {
      module.exports = {
        ...require_world_matter_engine(),
        ...require_world_matter_dense_grid(),
        ...require_world_matter_structure(),
        ...require_world_matter_camera(),
        ...require_world_matter_particles(),
        ...require_world_matter_renderer(),
        ...require_world_sprite_runtime(),
        ...require_world_noita_runtime()
      };
    }
  });
  return require_world_noita_stack();
})();
