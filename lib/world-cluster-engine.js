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
