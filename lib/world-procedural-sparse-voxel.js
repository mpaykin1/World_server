'use strict';

const crypto = require('crypto');

const FORMAT = 'world-procedural-svdag-v1';
function nextPow2(n) { let p = 1; while (p < n) p <<= 1; return p; }
function key3(x, y, z) { return `${x},${y},${z}`; }
function sha256(value) { return crypto.createHash('sha256').update(String(value)).digest('hex'); }

function encodeSparseVoxelDag(chunk) {
  if (!chunk || !Array.isArray(chunk.voxels) || !chunk.chunk) throw new TypeError('voxel chunk required');
  const sizeXZ = Math.max(1, Math.trunc(Number(chunk.chunk.size) || 16));
  const originX = Math.trunc(chunk.chunk.x) * sizeXZ;
  const originZ = Math.trunc(chunk.chunk.z) * sizeXZ;
  let minY = Infinity, maxY = -Infinity;
  const map = new Map();
  for (const v of chunk.voxels) {
    if (!Array.isArray(v) || v.length < 4) continue;
    const x = Math.trunc(v[0]) - originX;
    const y = Math.trunc(v[1]);
    const z = Math.trunc(v[2]) - originZ;
    if (x < 0 || x >= sizeXZ || z < 0 || z >= sizeXZ) continue;
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    map.set(key3(x, y, z), Math.max(0, Math.trunc(Number(v[3]) || 0)));
  }
  if (!Number.isFinite(minY)) { minY = 0; maxY = 0; }
  const ySpan = Math.max(1, maxY - minY + 1);
  const cubeSize = nextPow2(Math.max(sizeXZ, ySpan));
  const nodes = [];
  const intern = new Map();

  function internNode(node, key) {
    const known = intern.get(key);
    if (known != null) return known;
    const index = nodes.length;
    nodes.push(node);
    intern.set(key, index);
    return index;
  }
  const emptyLeaf = internNode({ t: 0, v: -1 }, 'L:-1');
  function build(x0, y0, z0, size) {
    if (size === 1) {
      const value = map.get(key3(x0, minY + y0, z0));
      if (value == null) return emptyLeaf;
      return internNode({ t: 0, v: value }, `L:${value}`);
    }
    const h = size >> 1;
    const children = [];
    for (let oy = 0; oy < 2; oy += 1) for (let oz = 0; oz < 2; oz += 1) for (let ox = 0; ox < 2; ox += 1) {
      children.push(build(x0 + ox * h, y0 + oy * h, z0 + oz * h, h));
    }
    const first = children[0];
    if (children.every((c) => c === first) && nodes[first]?.t === 0) return first;
    const key = `B:${children.join(',')}`;
    return internNode({ t: 1, c: children }, key);
  }

  const root = build(0, 0, 0, cubeSize);
  const serialized = JSON.stringify({ f: FORMAT, root, nodes, cubeSize, minY, sizeXZ });
  return {
    format: FORMAT,
    origin: { x: originX, y: minY, z: originZ },
    chunk: { x: Math.trunc(chunk.chunk.x), z: Math.trunc(chunk.chunk.z), size: sizeXZ },
    cubeSize,
    root,
    nodes,
    stats: {
      sourceVoxels: map.size,
      dagNodes: nodes.length,
      logicalLeafCells: cubeSize ** 3,
      jsonBytes: Buffer.byteLength(serialized),
      sourceJsonBytes: Buffer.byteLength(JSON.stringify(chunk.voxels)),
      dedupRatio: +(1 - nodes.length / Math.max(1, cubeSize ** 3)).toFixed(6)
    },
    checksum: sha256(serialized)
  };
}

function decodeSparseVoxelDag(encoded) {
  if (!encoded || encoded.format !== FORMAT || !Array.isArray(encoded.nodes)) throw new TypeError('valid sparse voxel DAG required');
  const out = [];
  const originX = Number(encoded.origin?.x) || 0;
  const originY = Number(encoded.origin?.y) || 0;
  const originZ = Number(encoded.origin?.z) || 0;
  const sizeXZ = Number(encoded.chunk?.size) || 16;
  const maxX = originX + sizeXZ - 1;
  const maxZ = originZ + sizeXZ - 1;

  function visit(index, x0, y0, z0, size) {
    const node = encoded.nodes[index];
    if (!node) throw new Error(`invalid SVDAG node ${index}`);
    if (node.t === 0) {
      if (node.v < 0) return;
      if (size === 1) {
        const x = originX + x0, y = originY + y0, z = originZ + z0;
        if (x <= maxX && z <= maxZ) out.push([x, y, z, node.v]);
        return;
      }
      for (let y = 0; y < size; y += 1) for (let z = 0; z < size; z += 1) for (let x = 0; x < size; x += 1) {
        const wx = originX + x0 + x, wz = originZ + z0 + z;
        if (wx <= maxX && wz <= maxZ) out.push([wx, originY + y0 + y, wz, node.v]);
      }
      return;
    }
    const h = size >> 1;
    let i = 0;
    for (let oy = 0; oy < 2; oy += 1) for (let oz = 0; oz < 2; oz += 1) for (let ox = 0; ox < 2; ox += 1) {
      visit(node.c[i++], x0 + ox * h, y0 + oy * h, z0 + oz * h, h);
    }
  }

  visit(encoded.root, 0, 0, 0, encoded.cubeSize);
  out.sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1] || a[3] - b[3]);
  return out;
}

function canonicalVoxels(voxels) {
  return (voxels || []).map((v) => [Number(v[0]), Number(v[1]), Number(v[2]), Number(v[3])])
    .sort((a, b) => a[0] - b[0] || a[2] - b[2] || a[1] - b[1] || a[3] - b[3]);
}
function verifyRoundTrip(chunk, encoded = encodeSparseVoxelDag(chunk)) {
  const source = canonicalVoxels(chunk.voxels);
  const decoded = canonicalVoxels(decodeSparseVoxelDag(encoded));
  const ok = JSON.stringify(source) === JSON.stringify(decoded);
  return { ok, sourceVoxels: source.length, decodedVoxels: decoded.length, checksum: encoded.checksum, stats: encoded.stats };
}

module.exports = { FORMAT, encodeSparseVoxelDag, decodeSparseVoxelDag, canonicalVoxels, verifyRoundTrip };
