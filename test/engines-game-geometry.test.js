'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(process.env.REVIEW_RUNTIME ||
  path.join(__dirname, '../lib/engines/browser-runtime.js'), 'utf8');
const first = source.indexOf('  function vertex(');
const last = source.indexOf('  let state=');
assert.ok(first >= 0 && last > first, 'Actual geometry functions must remain testable');
function bounds(data) {
  const points = [];
  for (let i = 0; i < data.length; i += 6) points.push(data.slice(i, i + 3));
  return { min: [0, 1, 2].map(a => Math.min(...points.map(p => p[a]))),
    max: [0, 1, 2].map(a => Math.max(...points.map(p => p[a]))) };
}
function near(actual, expected) {
  for (const edge of ['min', 'max']) for (let a = 0; a < 3; a++)
    assert.ok(Math.abs(actual[edge][a] - expected[edge][a]) < 1e-8,
      edge + ' axis ' + a + ': ' + actual[edge][a] + ' != ' + expected[edge][a]);
}
for (const position of [{ x: 0, y: 0, z: 2 }, { x: 0, y: 0, z: 32 },
  { x: 4, y: 1, z: -12 }]) {
  test('actual pillar geometry follows authored marker ' + JSON.stringify(position), () => {
    const baked = [], { x, y, z } = position, color = [1, 1, 1];
    vm.runInNewContext(source.slice(first, last), {
      baked, C: { rock: color, ground: color, silver: color, glow: color },
      data: { world: { solids: [], sceneMarkers: [{ position }] } }
    }, { timeout: 1000 });
    // A cube has 36 vertices with position and RGB. Check both actual rendered pillars.
    near(bounds(baked.slice(0, 216)), { min: [x - .86, y, z - .22],
      max: [x - .56, y + 2.7, z + .22] });
    near(bounds(baked.slice(216, 432)), { min: [x + .56, y, z - .22],
      max: [x + .86, y + 2.7, z + .22] });
  });
}
