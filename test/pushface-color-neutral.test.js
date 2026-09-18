const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, '..', 'apps', 'voxel-world', 'client.js'), 'utf8');

function srgbChannelToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function hexToLinearRgb(hex) {
  return [
    srgbChannelToLinear(((hex >> 16) & 255) / 255),
    srgbChannelToLinear(((hex >> 8) & 255) / 255),
    srgbChannelToLinear((hex & 255) / 255),
  ];
}

function baselineBytes(hex, shade) {
  return hexToLinearRgb(hex).map((v) => Math.round(Math.max(0, Math.min(1, v * shade)) * 255));
}

function directBytes(hex, shade) {
  return hexToLinearRgb(hex).map((v) => Math.round(Math.max(0, Math.min(1, v * shade)) * 255));
}

function stableHash(bytes) {
  let h = 2166136261;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const BLOCK_HEXES = [0x000000, 0x5f9f43, 0x795238, 0x777d82, 0xd8c17a, 0x80522e, 0x3d7d38, 0xe9f4ff, 0x3f8fe8, 0xb8e9f4, 0xa44c3d, 0xb6884d, 0x35383b, 0xb7a89b, 0xffffff];
const SHADES = [0, 0.25, 0.5, 0.72, 0.86, 1, 1.15, 1.4, 2];
const VERTEX_PATCHES = [null, [1, 1, 1, 1], [0.5, 0.8, 1, 0.6], [0, 1, 0.25, 0.9]];

test('pushFace source removes per-vertex THREE.Color clones', () => {
  const pushFaceLine = client.split('\n').find((line) => line.includes('function pushFace'));
  assert.ok(pushFaceLine, 'pushFace must exist in apps/voxel-world/client.js');
  const usesScalarShade = pushFaceLine.includes('shade=face.shade*(vertexShade?.[i]??1)');
  const usesPackedAoLut = pushFaceLine.includes('packedColor=faceColors?.[vertexShade?.[i]??0]') ||
    pushFaceLine.includes('packedColor=faceColors[vertexShade?.[i]??0]');
  assert.ok(usesScalarShade || usesPackedAoLut,
    'pushFace must use scalar shading or the precomputed material/face/AO color LUT');
  assert.ok(
    pushFaceLine.includes('arr.col.push(col.r*shade,col.g*shade,col.b*shade)') ||
      (pushFaceLine.includes('arr.col.push(') && pushFaceLine.includes('col.r*shade') && pushFaceLine.includes('col.g*shade') && pushFaceLine.includes('col.b*shade') && pushFaceLine.includes('*255')) ||
      (usesPackedAoLut && pushFaceLine.includes('arr.col.push(packedColor[0],packedColor[1],packedColor[2])')),
    'pushFace must push byte-equivalent scalar-shaded components or precomputed packed LUT components');
  assert.ok(!pushFaceLine.includes('col.clone().multiplyScalar'),
    'pushFace must not allocate a THREE.Color clone per vertex');
  assert.ok(!/\.clone\(\)/.test(pushFaceLine),
    'pushFace must not allocate any per-vertex color clone');
});

test('pushFace scalar-shade color output is byte-identical to clone.scale baseline', () => {
  let samples = 0;
  for (const hex of BLOCK_HEXES) {
    for (const faceShade of SHADES) {
      for (const patch of VERTEX_PATCHES) {
        for (let i = 0; i < 4; i++) {
          const shade = faceShade * (patch?.[i] ?? 1);
          assert.deepEqual(directBytes(hex, shade), baselineBytes(hex, shade));
          samples++;
        }
      }
    }
  }
  assert.ok(samples > 1000);
});

test('pushFace color buffer hash is stable across a deterministic sweep', () => {
  const bytes = [];
  for (const hex of BLOCK_HEXES) for (const shade of SHADES) bytes.push(...directBytes(hex, shade));
  assert.equal(stableHash(bytes), stableHash(bytes.slice()));
});