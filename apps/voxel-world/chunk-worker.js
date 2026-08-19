'use strict';

// Worker-side voxel mesher. It deliberately has no Three.js dependency.
// Opaque blocks use greedy rectangle meshing; translucent blocks and water
// keep per-face quads so sorting/blending stay predictable.

const CHUNK = 16;
const WORLD_Y = 96;
const PAD = CHUNK + 2;
const AIR = 0;
const WATER = 8;
const TRANSLUCENT = new Set([6, 9]);

const COLORS = [
  0x000000, 0x5f9f43, 0x795238, 0x777d82, 0xd8c17a, 0x80522e, 0x3d7d38,
  0xe9f4ff, 0x3f8fe8, 0xb8e9f4, 0xa44c3d, 0xb6884d, 0x35383b, 0xb7a89b
].map(hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255]);

function sample(blocks, x, y, z) {
  if (y < 0) return 3;
  if (y >= WORLD_Y) return AIR;
  if (x < -1 || x > CHUNK || z < -1 || z > CHUNK) return AIR;
  return blocks[(y * PAD + (z + 1)) * PAD + (x + 1)];
}

function isOpaque(block) {
  return block !== AIR && block !== WATER && !TRANSLUCENT.has(block);
}

function isTranslucent(block) {
  return TRANSLUCENT.has(block);
}

function target() {
  return { positions: [], normals: [], colors: [], indices: [] };
}

function appendQuad(dst, vertices, normal, block, shade) {
  const base = dst.positions.length / 3;
  const color = COLORS[block] || COLORS[3];
  const r = Math.min(1, color[0] * shade);
  const g = Math.min(1, color[1] * shade);
  const b = Math.min(1, color[2] * shade);

  for (const v of vertices) {
    dst.positions.push(v[0], v[1], v[2]);
    dst.normals.push(normal[0], normal[1], normal[2]);
    dst.colors.push(r, g, b);
  }
  dst.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function greedy2D(width, height, read, emit) {
  const mask = new Uint8Array(width * height);
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) mask[v * width + u] = read(u, v) || 0;
  }

  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width;) {
      const block = mask[v * width + u];
      if (!block) { u++; continue; }

      let w = 1;
      while (u + w < width && mask[v * width + u + w] === block) w++;

      let h = 1;
      outer: while (v + h < height) {
        for (let x = 0; x < w; x++) {
          if (mask[(v + h) * width + u + x] !== block) break outer;
        }
        h++;
      }

      emit(u, v, w, h, block);
      for (let yy = 0; yy < h; yy++) {
        mask.fill(0, (v + yy) * width + u, (v + yy) * width + u + w);
      }
      u += w;
    }
  }
}

function buildOpaque(blocks, dst) {
  // +X / -X: mask is z × y.
  for (let x = 0; x < CHUNK; x++) {
    greedy2D(CHUNK, WORLD_Y,
      (z, y) => {
        const block = sample(blocks, x, y, z);
        return isOpaque(block) && !isOpaque(sample(blocks, x + 1, y, z)) ? block : 0;
      },
      (z, y, w, h, block) => appendQuad(dst,
        [[x + 1, y, z], [x + 1, y + h, z], [x + 1, y + h, z + w], [x + 1, y, z + w]],
        [1, 0, 0], block, 0.90));

    greedy2D(CHUNK, WORLD_Y,
      (z, y) => {
        const block = sample(blocks, x, y, z);
        return isOpaque(block) && !isOpaque(sample(blocks, x - 1, y, z)) ? block : 0;
      },
      (z, y, w, h, block) => appendQuad(dst,
        [[x, y, z + w], [x, y + h, z + w], [x, y + h, z], [x, y, z]],
        [-1, 0, 0], block, 0.82));
  }

  // +Y / -Y: mask is x × z.
  for (let y = 0; y < WORLD_Y; y++) {
    greedy2D(CHUNK, CHUNK,
      (x, z) => {
        const block = sample(blocks, x, y, z);
        return isOpaque(block) && !isOpaque(sample(blocks, x, y + 1, z)) ? block : 0;
      },
      (x, z, w, h, block) => appendQuad(dst,
        [[x, y + 1, z], [x, y + 1, z + h], [x + w, y + 1, z + h], [x + w, y + 1, z]],
        [0, 1, 0], block, 1.05));

    greedy2D(CHUNK, CHUNK,
      (x, z) => {
        const block = sample(blocks, x, y, z);
        return isOpaque(block) && !isOpaque(sample(blocks, x, y - 1, z)) ? block : 0;
      },
      (x, z, w, h, block) => appendQuad(dst,
        [[x, y, z + h], [x, y, z], [x + w, y, z], [x + w, y, z + h]],
        [0, -1, 0], block, 0.62));
  }

  // +Z / -Z: mask is x × y.
  for (let z = 0; z < CHUNK; z++) {
    greedy2D(CHUNK, WORLD_Y,
      (x, y) => {
        const block = sample(blocks, x, y, z);
        return isOpaque(block) && !isOpaque(sample(blocks, x, y, z + 1)) ? block : 0;
      },
      (x, y, w, h, block) => appendQuad(dst,
        [[x + w, y, z + 1], [x + w, y + h, z + 1], [x, y + h, z + 1], [x, y, z + 1]],
        [0, 0, 1], block, 0.94));

    greedy2D(CHUNK, WORLD_Y,
      (x, y) => {
        const block = sample(blocks, x, y, z);
        return isOpaque(block) && !isOpaque(sample(blocks, x, y, z - 1)) ? block : 0;
      },
      (x, y, w, h, block) => appendQuad(dst,
        [[x, y, z], [x, y + h, z], [x + w, y + h, z], [x + w, y, z]],
        [0, 0, -1], block, 0.76));
  }
}

const FACES = [
  { d: [1, 0, 0], n: [1, 0, 0], shade: 0.90, v: [[1,0,0],[1,1,0],[1,1,1],[1,0,1]] },
  { d: [-1, 0, 0], n: [-1, 0, 0], shade: 0.82, v: [[0,0,1],[0,1,1],[0,1,0],[0,0,0]] },
  { d: [0, 1, 0], n: [0, 1, 0], shade: 1.05, v: [[0,1,0],[0,1,1],[1,1,1],[1,1,0]] },
  { d: [0, -1, 0], n: [0, -1, 0], shade: 0.62, v: [[0,0,1],[0,0,0],[1,0,0],[1,0,1]] },
  { d: [0, 0, 1], n: [0, 0, 1], shade: 0.94, v: [[1,0,1],[1,1,1],[0,1,1],[0,0,1]] },
  { d: [0, 0, -1], n: [0, 0, -1], shade: 0.76, v: [[0,0,0],[0,1,0],[1,1,0],[1,0,0]] }
];

function buildBlended(blocks, translucent, water) {
  for (let x = 0; x < CHUNK; x++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let y = 0; y < WORLD_Y; y++) {
        const block = sample(blocks, x, y, z);
        if (block !== WATER && !isTranslucent(block)) continue;
        for (const face of FACES) {
          const next = sample(blocks, x + face.d[0], y + face.d[1], z + face.d[2]);
          let visible = false;
          if (block === WATER) visible = next === AIR;
          else visible = next === AIR || next === WATER;
          if (!visible) continue;
          const verts = face.v.map(v => [x + v[0], y + v[1], z + v[2]]);
          appendQuad(block === WATER ? water : translucent, verts, face.n, block, face.shade);
        }
      }
    }
  }
}

function finalize(data) {
  const vertexCount = data.positions.length / 3;
  const IndexArray = vertexCount <= 65535 ? Uint16Array : Uint32Array;
  return {
    positions: new Float32Array(data.positions),
    normals: new Float32Array(data.normals),
    colors: new Float32Array(data.colors),
    indices: new IndexArray(data.indices),
    vertices: vertexCount,
    triangles: data.indices.length / 3
  };
}

function transferables(geometry) {
  const out = [];
  for (const part of Object.values(geometry)) {
    if (!part || typeof part !== 'object') continue;
    for (const key of ['positions', 'normals', 'colors', 'indices']) {
      if (part[key]?.buffer) out.push(part[key].buffer);
    }
  }
  return out;
}

self.onmessage = event => {
  const message = event.data || {};
  if (message.type !== 'mesh' || !(message.blocks instanceof Uint8Array)) return;

  const startedAt = performance.now();
  const solid = target();
  const translucent = target();
  const water = target();
  buildOpaque(message.blocks, solid);
  buildBlended(message.blocks, translucent, water);

  const geometry = {
    solid: finalize(solid),
    translucent: finalize(translucent),
    water: finalize(water)
  };
  const stats = {
    ms: performance.now() - startedAt,
    triangles: geometry.solid.triangles + geometry.translucent.triangles + geometry.water.triangles
  };

  const payload = {
    type: 'mesh_result',
    jobId: message.jobId,
    key: message.key,
    version: message.version,
    geometry,
    stats
  };
  self.postMessage(payload, transferables(geometry));
};
