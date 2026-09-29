'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const client = fs.readFileSync(path.join(__dirname, '..', 'apps', 'voxel-world', 'client.js'), 'utf8');

function sourceLine(fragment) {
  const line = client.split('\n').find((l) => l.includes(fragment));
  assert.ok(line, `expected a source line containing ${fragment}`);
  return line;
}

test('makeGeometry uploads typed quantized attributes only', () => {
  const line = sourceLine('function makeGeometry');
  assert.ok(line.includes("g.setAttribute('position',new THREE.BufferAttribute(Int16Array.from(data.pos),3))"),
    'position must stay Int16 typed');
  assert.ok(line.includes("Uint8Array.from(data.col),3,true"),
    'color must stay normalized Uint8');
  assert.ok(line.includes("g.setAttribute('normal',new THREE.BufferAttribute(Int8Array.from(data.nor),3))"),
    'normal must stay Int8');
  assert.ok(line.includes("g.setAttribute('uv',new THREE.BufferAttribute(Uint16Array.from(data.uv),2,true))"),
    'uv must stay normalized Uint16');
  assert.ok(line.includes("g.setAttribute('goldenShore',new THREE.BufferAttribute(Uint16Array.from(data.shore),1,true))"),
    'goldenShore must stay normalized Uint16');
  assert.ok(line.includes("g.setAttribute('goldenMaterial',new THREE.BufferAttribute(Uint8Array.from(data.mat),1))"),
    'goldenMaterial must stay Uint8');
  assert.ok(!/Float32BufferAttribute|Float32Array/.test(line),
    'geometry builder must not resurrect per-vertex float attributes');
});

test('makeGeometry keeps the shared 16-bit index for small chunks and Uint32 fallback', () => {
  const line = sourceLine('function makeGeometry');
  assert.ok(line.includes('useU16=vertexCount<=65535'),
    '16-bit index path must be selected only while vertex count fits');
  assert.ok(line.includes('g.setIndex(useU16?QUAD_INDEX_U16_ATTRIBUTE') ||
            line.includes('g.setIndex(useU16?QUAD_INDEX_U16_ATTRIBUTE:\n'),
    'small chunks must reuse the shared 16-bit index template');
  assert.ok(line.includes('QUAD_INDEX_U16_ATTRIBUTE'),
    'shared 16-bit chunk index attribute must be reused');
  assert.ok(line.includes('if(useU16)g.setDrawRange(0,quadCount*6)'),
    'shared index reuse must be draw-range scoped instead of a per-chunk copy');
});

test('water meshes must not carry a dead color attribute', () => {
  const makeLine = sourceLine('function makeGeometry');
  assert.ok(makeLine.includes('if(data.col)g.setAttribute'),
    'color attribute must be optional (no data.col, no attribute)');
  const waterBuilders = client.split('\n').filter((l) => l.includes('water={pos'));
  assert.ok(waterBuilders.length >= 2,
    'both sync and incremental chunk builders must define the water buffer');
  for (const line of waterBuilders) {
    assert.ok(!line.includes('water={pos:[],col:'),
      'water buffer must not collect per-vertex colors (waterMaterial has vertexColors:false)');
  }
  const pushLine = sourceLine('arr.col.push');
  assert.ok(pushLine.includes('if(arr.col)'),
    'pushFace must skip per-vertex color writes when the destination buffer has no color channel');
});

test('vertex colors are integer-quantized before upload', () => {
  const colorLut = sourceLine('FACE_COLOR_BY_MATERIAL');
  assert.ok(colorLut.includes('*255'),
    'the material/face/AO color LUT must pre-quantize channels to 0..255 integers');
  const line = sourceLine('function makeGeometry');
  assert.ok(line.includes('Uint8Array.from(data.col)'),
    'color values must round-trip through Uint8 quantization on upload');
});