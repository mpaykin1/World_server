'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const engine = path.join(__dirname, '..', 'engine');
const scene = fs.readFileSync(path.join(engine, '20_scene.js'), 'utf8');
const main = fs.readFileSync(path.join(engine, '95_main.js'), 'utf8');

function perfHarness() {
  const start = main.indexOf('function perfMonitor(');
  const end = main.indexOf('function frame(', start);
  assert.ok(start >= 0 && end > start, 'monitor exists before frame');
  let resized = 0;
  const ctx = {
    perf: { scale: 0.8, acc: 0, frames: 0, cool: 0 },
    document: { hidden: false },
    resize() { resized++; },
  };
  vm.createContext(ctx);
  vm.runInContext(main.slice(start, end), ctx);
  return { ctx, get resized() { return resized; } };
}
function sample(ctx, delta, frames) {
  for (let i = 0; i < frames; i++) ctx.perfMonitor(delta);
}

test('render monitor uses elapsed wall time rather than capped simulation dt', () => {
  assert.match(main, /const elapsed = last \?/);
  assert.match(main, /const raw = Math\.min\(0\.05, elapsed\)/);
  assert.match(main, /perfMonitor\(elapsed\)/);
  const sim = perfHarness();
  sample(sim.ctx, 0.100, 21);
  assert.equal(sim.ctx.perf.scale, 0.7);
  assert.equal(sim.resized, 1);
  assert.ok(sim.ctx.perf.fps >= 9.5 && sim.ctx.perf.fps <= 10.5);
});

test('stable high FPS improves quality gradually, without rapid oscillation', () => {
  const sim = perfHarness();
  sample(sim.ctx, 1 / 60, 126);
  assert.equal(sim.ctx.perf.scale, 0.85);
  sample(sim.ctx, 1 / 60, 126);
  assert.equal(sim.ctx.perf.scale, 0.85, 'cooldown prevents premature second resize');
  sample(sim.ctx, 1 / 60, 126);
  assert.equal(sim.ctx.perf.scale, 0.9);
  assert.equal(sim.resized, 2);
});

test('tab inactivity does not trigger unnecessary quality degradation', () => {
  const sim = perfHarness();
  sample(sim.ctx, 1 / 60, 60);
  sim.ctx.document.hidden = true;
  sim.ctx.perfMonitor(1 / 4);
  assert.equal(sim.ctx.perf.acc, 0);
  assert.equal(sim.ctx.perf.frames, 0);
  sim.ctx.document.hidden = false;
  sim.ctx.perfMonitor(8);  // user returned after tab suspension
  assert.equal(sim.ctx.perf.acc, 0);
  sample(sim.ctx, 1 / 60, 126);
  assert.equal(sim.ctx.perf.scale, 0.85);
  assert.equal(sim.resized, 1);
});

test('wind displacement is injected only for leafy voxels, using shared time', () => {
  const start = scene.indexOf('const cutU =');
  const end = scene.indexOf('// water', start);
  assert.ok(start > 0 && end > start, 'terrain shader section exists');
  const U = { time: { value: 1.5 } };
  const target = { onBeforeCompile: null };
  const ctx = {
    terrainMat: target, U, REDUCED: false,
    THREE: { Vector3: class Vector3 {} },
  };
  vm.createContext(ctx);
  vm.runInContext(scene.slice(start, end), ctx);
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>',
  };
  target.onBeforeCompile(shader);
  assert.strictEqual(shader.uniforms.uWindTime, U.time);
  assert.equal(shader.uniforms.uWindStrength.value, 0.055);
  assert.match(shader.vertexShader, /if \(aCut > 0\.5\)/);
  assert.match(shader.vertexShader, /transformed\.x \+= uWindStrength/);
  assert.match(shader.vertexShader, /transformed\.z \+= uWindStrength/);
  assert.equal((shader.vertexShader.match(/float\s+\w+\s*=\s*sin\(/g) || []).length, 1,
    'only one sine evaluation should run for each moving foliage vertex');
  assert.match(shader.vertexShader, /vWPos = \(modelMatrix/);
  assert.match(shader.fragmentShader, /if \(vCut > 0\.5/);
  // Three.js intentionally expands built-in chunks after onBeforeCompile.
  assert.match(shader.vertexShader, /#include <begin_vertex>/);
  assert.match(shader.fragmentShader, /#include <clipping_planes_fragment>/);
});

test('reduced-motion preference limits the amplitude without adding a pass', () => {
  const start = scene.indexOf('const cutU =');
  const end = scene.indexOf('// water', start);
  const target = {};
  const ctx = { terrainMat: target, U: { time: { value: 0 } }, REDUCED: true, THREE: { Vector3: class Vector3 {} } };
  vm.createContext(ctx);
  vm.runInContext(scene.slice(start, end), ctx);
  const shader = {
    uniforms: {},
    vertexShader: '#include <common>\n#include <begin_vertex>',
    fragmentShader: '#include <common>\n#include <clipping_planes_fragment>',
  };
  target.onBeforeCompile(shader);
  assert.equal(shader.uniforms.uWindStrength.value, 0.015);
  assert.match(shader.vertexShader, /uniform float uWindTime, uWindStrength/);
});
