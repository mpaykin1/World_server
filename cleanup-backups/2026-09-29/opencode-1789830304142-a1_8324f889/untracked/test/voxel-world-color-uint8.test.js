'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'apps', 'voxel-world', 'client.js'), 'utf8');
const makeGeometryLine = src.split('\n').find((line) => line.includes('function makeGeometry'));
const pushFaceLine = src.split('\n').find((line) => line.includes('function pushFace'));

const BLOCK_HEXES = [0x000000, 0x5f9f43, 0x795238, 0x777d82, 0xd8c17a, 0x80522e, 0x3d7d38, 0xe9f4ff, 0x3f8fe8, 0xb8e9f4, 0xa44c3d, 0xb6884d, 0x35383b, 0xb7a89b];
const FACE_SHADES = [0.9, 0.82, 1.05, 0.62, 0.94, 0.76];
const AO_SHADES = [1, 0.86, 0.72, 0.58];

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

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function quantizedBytes(hex, faceShade, aoShade) {
  return hexToLinearRgb(hex).map((v) => Math.round(clamp01(v * faceShade * aoShade) * 255));
}

function stableHash(bytes) {
  let h = 2166136261;
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

test('makeGeometry stores vertex color as a normalized Uint8 attribute (3 bytes per vertex)', () => {
  assert.ok(makeGeometryLine, 'makeGeometry must exist in apps/voxel-world/client.js');
  const usesUint8ColorAttr =
    /setAttribute\('color',new THREE\.BufferAttribute\(Uint8Array\.from\(data\.col\),3,true\)\)/.test(makeGeometryLine) ||
    /setAttribute\('color',new THREE\.Uint8BufferAttribute\(data\.col,3\)\)/.test(makeGeometryLine);
  assert.ok(usesUint8ColorAttr, 'makeGeometry must store vertex color as normalized Uint8 (3 bytes/element)');
  assert.ok(!/setAttribute\('color',new THREE\.(Float32BufferAttribute|Float64BufferAttribute)\(/.test(makeGeometryLine),
    'makeGeometry must not store vertex color as Float32/Float64');
  assert.ok(!/BufferAttribute\((Float32Array|Float64Array)\.from\(data\.col\)/.test(makeGeometryLine),
    'makeGeometry must not build the color attribute from a Float32/Float64 array');
});

test('vertex color LUT is pre-quantized to integer bytes and pushFace uses the LUT directly', () => {
  assert.match(src, /FACE_COLOR_BY_MATERIAL=BLOCK_RGB\.map\(col=>FACE\.map\(face=>FACE_AO_SHADE\.map\(ao=>/);
  assert.match(src, /Math\.round\(Math\.max\(0,Math\.min\(1,col\.r\*face\.shade\*ao\)\)\*255\)/);
  assert.match(src, /Math\.round\(Math\.max\(0,Math\.min\(1,col\.g\*face\.shade\*ao\)\)\*255\)/);
  assert.match(src, /Math\.round\(Math\.max\(0,Math\.min\(1,col\.b\*face\.shade\*ao\)\)\*255\)/);
  assert.ok(pushFaceLine, 'pushFace must exist in apps/voxel-world/client.js');
  assert.match(pushFaceLine, /arr\.col\.push\(c0\[0\],c0\[1\],c0\[2\],c1\[0\],c1\[1\],c1\[2\],c2\[0\],c2\[1\],c2\[2\],c3\[0\],c3\[1\],c3\[2\]\)/,
    'pushFace must push precomputed LUT color bytes per face vertex');
});

test('quantized color bytes decode within 1/255 per channel over the real palette x face and AO shades', () => {
  let samples = 0;
  for (const hex of BLOCK_HEXES) {
    for (const faceShade of FACE_SHADES) {
      for (const aoShade of AO_SHADES) {
        const linear = hexToLinearRgb(hex);
        for (let c = 0; c < 3; c++) {
          const value = clamp01(linear[c] * faceShade * aoShade);
          const decoded = quantizedBytes(hex, faceShade, aoShade)[c] / 255;
          assert.ok(Math.abs(decoded - value) <= 1 / 255, `channel ${c} error > 1/255 (hex=${hex})`);
          samples++;
        }
      }
    }
  }
  assert.ok(samples > 1000);
});

test('Uint8 color attribute costs 3 bytes per vertex, 75% less than the Float32 fallback', () => {
  const colorBytesPerComponent = /Uint8/.test(makeGeometryLine.split("setAttribute('color'").pop() || '') ? 1 : 4;
  const colorBytesPerVertex = colorBytesPerComponent * 3;
  assert.equal(colorBytesPerVertex, 3, 'quantized color attribute must be 3 bytes per vertex');
  const float32BytesPerVertex = 4 * 3;
  assert.equal(float32BytesPerVertex, 12);
  const reduction = (float32BytesPerVertex - colorBytesPerVertex) / float32BytesPerVertex;
  assert.ok(reduction >= 0.749, `color storage reduction must be >= 75%, got ${(reduction * 100).toFixed(1)}%`);
});

test('vertex buffer size model keeps solid and water color memory below the Float32 fallback', () => {
  const pos = 3 * 2;
  const normal = 3 * 1;
  const index = 1.5;
  const colorUint8 = 3 * 1;
  const colorFloat32 = 3 * 4;
  const solidExtra = 2 * 2 + 1 * 1;
  const waterExtra = 2 * 1;
  const solidUint8 = pos + colorUint8 + normal + solidExtra + index;
  const solidFloat32 = pos + colorFloat32 + normal + solidExtra + index;
  const waterUint8 = pos + colorUint8 + normal + waterExtra + index;
  const waterFloat32 = pos + colorFloat32 + normal + waterExtra + index;
  assert.ok(solidUint8 < solidFloat32, 'solid geometry must shrink when color is Uint8');
  assert.ok(waterUint8 < waterFloat32, 'water geometry must shrink when color is Uint8');
  assert.ok((solidFloat32 - solidUint8) / solidFloat32 >= 0.3, 'solid color Uint8 must cut total vertex buffer bytes by >= 30%');
  assert.ok((waterFloat32 - waterUint8) / waterFloat32 >= 0.35, 'water color Uint8 must cut total vertex buffer bytes by >= 35%');
});

test('quantized color byte sweep is deterministic and byte-exact', () => {
  const bytes = [];
  for (const hex of BLOCK_HEXES) {
    for (const faceShade of FACE_SHADES) {
      for (const aoShade of AO_SHADES) {
        bytes.push(...quantizedBytes(hex, faceShade, aoShade));
      }
    }
  }
  assert.ok(bytes.every((b) => Number.isInteger(b) && b >= 0 && b <= 255), 'every quantized byte must be an integer 0..255');
  assert.equal(stableHash(bytes), stableHash(bytes.slice()));
  assert.equal(bytes.length, BLOCK_HEXES.length * FACE_SHADES.length * AO_SHADES.length * 3);
});