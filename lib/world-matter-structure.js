'use strict';

const { MATERIALS, key } = require('./world-matter-engine');

const DIRS = Object.freeze([
  [1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]
]);

function parsePosition(value) {
  return value.split(',').map(Number);
}

function isStructural(cell) {
  return Boolean(cell && MATERIALS[cell.material]?.structural);
}

function structuralPositions(world) {
  const out = new Set();
  for (const [position, cell] of world.cells) {
    if (isStructural(cell)) out.add(position);
  }
  return out;
}

function neighborsOf(position) {
  const [x,y,z] = parsePosition(position);
  return DIRS.map(([dx,dy,dz]) => key(x+dx,y+dy,z+dz));
}

function findSupported(world, options = {}) {
  const groundY = Number.isFinite(options.groundY) ? options.groundY : 0;
  const isAnchor = typeof options.isAnchor === 'function'
    ? options.isAnchor : ((x,y) => y <= groundY);
  const structural = structuralPositions(world);
  const supported = new Set();
  const queue = [];
  for (const position of structural) {
    const [x,y,z] = parsePosition(position);
    const cell = world.cells.get(position);
    if (!isAnchor(x,y,z,cell)) continue;
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
  const pending = new Set([...structural].filter(p => !supported.has(p)));
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
  clusters.sort((a,b) => b.length - a.length);
  return clusters;
}

function makeRigidCluster(world, positions, id) {
  const absolute = positions.map(position => {
    const [x,y,z] = parsePosition(position);
    return { x,y,z, cell: { ...world.cells.get(position) } };
  });
  const center = absolute.reduce((a,p) => ({
    x:a.x+p.x, y:a.y+p.y, z:a.z+p.z
  }), {x:0,y:0,z:0});
  const n = Math.max(1, absolute.length);
  center.x /= n; center.y /= n; center.z /= n;
  return {
    id,
    position: { ...center },
    velocity: { x:0, y:0, z:0 },
    angle: 0,
    angularVelocity: 0,
    cells: absolute.map(p => ({
      x:p.x-center.x, y:p.y-center.y, z:p.z-center.z, cell:p.cell
    })),
    settled: false
  };
}

function detachUnsupported(world, options = {}) {
  const minCells = Math.max(1, Number(options.minCells) || 2);
  const clusters = findUnsupportedClusters(world, options)
    .filter(cells => cells.length >= minCells);
  const detached = [];
  let serial = Number(options.serial) || 1;
  for (const positions of clusters) {
    const cluster = makeRigidCluster(world, positions, serial++);
    for (const position of positions) {
      const [x,y,z] = parsePosition(position);
      world.setCell(x,y,z,'air');
    }
    world._emit?.('detach', {
      clusterId: cluster.id,
      count: cluster.cells.length,
      at: [cluster.position.x,cluster.position.y,cluster.position.z]
    });
    detached.push(cluster);
  }
  return detached;
}

function applyDamage(world, x, y, z, amount = 1, radius = 0) {
  const broken = [];
  const r = Math.max(0, Math.floor(radius));
  for (let dx=-r; dx<=r; dx++) for (let dy=-r; dy<=r; dy++) {
    for (let dz=-r; dz<=r; dz++) {
      if (dx*dx + dy*dy + dz*dz > r*r) continue;
      const px=x+dx, py=y+dy, pz=z+dz;
      const cell = world.getCell(px,py,pz);
      if (!cell || !isStructural(cell)) continue;
      cell.integrity = Math.max(0, (cell.integrity ?? 1) - amount);
      if (cell.integrity <= 0) {
        world.setCell(px,py,pz,'air');
        world._emit?.('fracture', { material: cell.material, at:[px,py,pz] });
        broken.push([px,py,pz]);
      } else {
        world.setCell(px,py,pz,cell.material,cell);
      }
    }
  }
  return broken;
}

function rotateCell(cell, angle) {
  const c=Math.cos(angle), s=Math.sin(angle);
  return {
    x:cell.x*c-cell.y*s,
    y:cell.x*s+cell.y*c,
    z:cell.z,
    cell:cell.cell
  };
}

function worldCellsForCluster(cluster, position = cluster.position) {
  return cluster.cells.map(cell => {
    const p = rotateCell(cell, cluster.angle);
    return {
      x: Math.round(position.x+p.x),
      y: Math.round(position.y+p.y),
      z: Math.round(position.z+p.z),
      cell: p.cell
    };
  });
}

class RigidClusterSystem {
  constructor(options = {}) {
    this.gravity = Number.isFinite(options.gravity) ? options.gravity : -22;
    this.maxFallSpeed = Number(options.maxFallSpeed) || 34;
    this.shatterSpeed = Number(options.shatterSpeed) || 13;
    this.clusters = [];
    this.nextId = 1;
  }

  detach(world, options = {}) {
    const found = detachUnsupported(world, {
      ...options, serial: this.nextId
    });
    this.nextId += found.length;
    for (const cluster of found) {
      const sign = cluster.id % 2 ? 1 : -1;
      cluster.angularVelocity = sign * Math.min(.9, .08 + cluster.cells.length * .003);
      this.clusters.push(cluster);
    }
    return found;
  }

  _collides(world, cluster, position, externalSolid) {
    for (const p of worldCellsForCluster(cluster, position)) {
      if (world.cells.has(key(p.x,p.y,p.z))) return true;
      if(externalSolid?.(p.x,p.y,p.z))return true;
    }
    return false;
  }

  _settle(world, cluster, shatter = false) {
    const placed = new Set();
    for (const p of worldCellsForCluster(cluster)) {
      let y = p.y;
      while (world.cells.has(key(p.x,y,p.z)) && y < p.y + 8) y++;
      if (placed.has(key(p.x,y,p.z))) continue;
      placed.add(key(p.x,y,p.z));
      const material = shatter && p.cell.material === 'stone' ? 'sand' : p.cell.material;
      world.setCell(p.x,y,p.z,material,p.cell);
    }
    cluster.settled = true;
    world._emit?.(shatter ? 'cluster-shatter' : 'cluster-settle', {
      clusterId:cluster.id, count:cluster.cells.length,
      at:[cluster.position.x,cluster.position.y,cluster.position.z]
    });
  }

  step(world, dt = 1/60, externalSolid) {
    const active = [];
    for (const cluster of this.clusters) {
      if (cluster.settled) continue;
      cluster.velocity.y = Math.max(
        -this.maxFallSpeed, cluster.velocity.y + this.gravity * dt
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
    return this.clusters.map(cluster => ({
      id:cluster.id, angle:cluster.angle,
      position:{...cluster.position},
      cells:worldCellsForCluster(cluster).map(p => ({
        x:p.x,y:p.y,z:p.z,material:p.cell.material
      }))
    }));
  }
}

module.exports = {
  isStructural, findSupported, findUnsupportedClusters,
  detachUnsupported, applyDamage, worldCellsForCluster, RigidClusterSystem
};
