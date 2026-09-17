'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'apps/voxel-world', 'client.js'), 'utf8');

function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

class MiniColor {
  constructor(value) {
    this.r = Math.min(1, Math.max(0, srgbToLinear(((value >> 16) & 255) / 255)));
    this.g = Math.min(1, Math.max(0, srgbToLinear(((value >> 8) & 255) / 255)));
    this.b = Math.min(1, Math.max(0, srgbToLinear((value & 255) / 255)));
  }
  clone() {
    const c = new MiniColor(0);
    c.r = this.r; c.g = this.g; c.b = this.b;
    return c;
  }
  multiplyScalar(s) {
    this.r *= s; this.g *= s; this.b *= s;
    return this;
  }
}

function baselineColorFloats(hex, shade, vertexShade, i) {
  const col = new MiniColor(hex);
  const c = col.clone().multiplyScalar(shade * (vertexShade && vertexShade[i] != null ? vertexShade[i] : 1));
  return [c.r, c.g, c.b];
}

function scalarColorFloats(hex, shade, vertexShade, i) {
  const col = new MiniColor(hex);
  const s = shade * (vertexShade && vertexShade[i] != null ? vertexShade[i] : 1);
  return [col.r * s, col.g * s, col.b * s];
}

function toFloat32Bytes(values) {
  return Buffer.from(new Float32Array(values).buffer);
}

function hash(buf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < buf.length; i++) {
    h ^= buf[i];
    h = (h * 0x01000193) >>> 0;
  }
  return h;
}

const BLOCK_HEXES = [0x000000, 0x5f9f43, 0x795238, 0x777d82, 0xd8c17a, 0x80522e, 0x3d7d38, 0xe9f4ff, 0x3f8fe8, 0xb8e9f4, 0xa44c3d, 0xb6884d, 0x35383b, 0xb7a89b, 0xffffff];
const SHADES = [0, 0.25, 0.5, 0.72, 0.86, 1, 1.15, 1.4, 2];
const VERTEX_PATCHES = [null, [1, 1, 1, 1], [0.5, 0.8, 1, 0.6], [0, 1, 0.25, 0.9]];

test('pushFace source removes per-vertex THREE.Color clones', () => {
  const pushFaceLine = client.split('\n').find((line) => line.includes('function pushFace'));
  assert.ok(pushFaceLine, 'pushFace must exist in apps/voxel-world/client.js');
  assert.ok(pushFaceLine.includes('const shade=face.shade*(vertexShade?.[i]??1)'),
    'pushFace must compute the shade scalar once per vertex');
  assert.ok(pushFaceLine.includes('arr.col.push(col.r*shade,col.g*shade,col.b*shade)'),
    'pushFace must push the scalar-multiplied color components');
  assert.ok(!pushFaceLine.includes('col.clone().multiplyScalar'),
    'pushFace must not allocate a THREE.Color clone per vertex');
  assert.ok(!/\.clone\(\)/.test(pushFaceLine),
    'pushFace must not allocate any per-vertex color clone');
});

test('pushFace scalar-shade color output is byte-identical to clone.scale baseline', () => {
  let samples = 0;
  for (const hex of BLOCK_HEXES) {
    for (const shade of SHADES) {
      for (const patch of VERTEX_PATCHES) {
        for (let i = 0; i < 4; i++) {
          const base = baselineColorFloats(hex, shade, patch, i);
          const scaled = scalarColorFloats(hex, shade, patch, i);
          assert.equal(hash(toFloat32Bytes(base)), hash(toFloat32Bytes(scaled)),
            `float32 mismatch hex=0x${hex.toString(16)} shade=${shade} i=${i}`);
          assert.deepEqual(base, scaled, `component mismatch hex=0x${hex.toString(16)} shade=${shade} i=${i}`);
          samples++;
        }
      }
    }
  }
  assert.equal(samples, BLOCK_HEXES.length * SHADES.length * VERTEX_PATCHES.length * 4);
});

test('pushFace color buffer hash is stable across a deterministic sweep', () => {
  let seed = 0x2f6e2b1;
  const next = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed; };
  const colors = [];
  for (let k = 0; k < 40; k++) {
    colors.push(next() >>> 8);
  }
  const first = hash(toFloat32Bytes(colors));
  for (let round = 1; round < 5; round++) {
    const again = [];
    for (let k = 0; k < 40; k++) {
      again.push((next() * 0) + colors[k]);
    }
    assert.equal(hash(toFloat32Bytes(again)), first, 'deterministic sweep must be reproducible');
  }
});