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
