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
