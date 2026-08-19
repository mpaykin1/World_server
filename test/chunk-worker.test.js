'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function runMesher(blocks) {
  const source = fs.readFileSync(path.join(__dirname, '../apps/voxel-world/chunk-worker.js'), 'utf8');
  let posted = null;
  const context = {
    Uint8Array,
    Uint16Array,
    Uint32Array,
    Float32Array,
    Set,
    Object,
    Math,
    performance: { now: (() => { let n = 0; return () => ++n; })() },
    self: { postMessage(payload) { posted = payload; } }
  };
  vm.runInNewContext(source, context, { filename: 'chunk-worker.js' });
  context.self.onmessage({ data: { type: 'mesh', jobId: 7, key: '0,0', version: 3, blocks } });
  return posted;
}

test('greedy mesher collapses a solid chunk prism to a handful of quads', () => {
  const CHUNK = 16, WORLD_Y = 96, PAD = CHUNK + 2;
  const blocks = new Uint8Array(PAD * WORLD_Y * PAD);
  const idx = (x, y, z) => (y * PAD + (z + 1)) * PAD + (x + 1);
  for (let y = 0; y < 32; y++) {
    for (let z = 0; z < CHUNK; z++) {
      for (let x = 0; x < CHUNK; x++) blocks[idx(x, y, z)] = 3;
    }
  }
  const result = runMesher(blocks);
  assert.equal(result.type, 'mesh_result');
  assert.equal(result.jobId, 7);
  assert.equal(result.version, 3);
  assert.equal(result.geometry.solid.triangles, 10);
  assert.equal(result.geometry.translucent.triangles, 0);
  assert.equal(result.geometry.water.triangles, 0);
  assert.ok(result.geometry.solid.vertices <= 20);
});

test('worker ignores malformed messages without posting geometry', () => {
  const source = fs.readFileSync(path.join(__dirname, '../apps/voxel-world/chunk-worker.js'), 'utf8');
  let calls = 0;
  const context = { Uint8Array, Uint16Array, Uint32Array, Float32Array, Set, Object, Math, performance: { now: () => 1 }, self: { postMessage() { calls++; } } };
  vm.runInNewContext(source, context, { filename: 'chunk-worker.js' });
  context.self.onmessage({ data: { type: 'wrong', blocks: new Uint8Array(1) } });
  context.self.onmessage({ data: { type: 'mesh', blocks: 'not-array' } });
  assert.equal(calls, 0);
});
