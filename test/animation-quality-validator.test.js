'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluate, angleDeg } = require('../shared/animation-quality-validator');

test('feet aligned with movement and attack produce perfect semantic score', () => {
  const result = evaluate({
    movementDirection: { x: 0, y: 0, z: 1 },
    feetDirection: { x: 0, y: 0, z: 1 },
    attackDirection: { x: 0.05, y: 0, z: 1 },
    weaponPosition: { x: 0.1, y: 1.2, z: 0.1 },
    weaponHandPosition: { x: 0.1, y: 1.2, z: 0.1 },
    shieldPosition: { x: 0, y: 1, z: 0.45 },
    torsoPosition: { x: 0, y: 1, z: 0 },
    shieldUp: { x: 0, y: 1, z: 0 },
    shieldCoverage: 0.85
  });
  assert.equal(result.score, 100);
  assert.deepEqual(result.violations, []);
});

test('validator detects feet, attack, weapon and shield contract regressions', () => {
  const result = evaluate({
    movementDirection: { x: 1, y: 0, z: 0 },
    feetDirection: { x: 0, y: 0, z: 1 },
    attackDirection: { x: -1, y: 0, z: 0 },
    weaponPosition: { x: 2, y: 1, z: 0 },
    weaponHandPosition: { x: 0, y: 1, z: 0 },
    shieldPosition: { x: 0, y: 1, z: -1 },
    torsoPosition: { x: 0, y: 1, z: 0 },
    shieldUp: { x: 1, y: 0, z: 0 },
    shieldCoverage: 0.25
  });
  const ids = new Set(result.violations.map(v => v.id));
  assert(ids.has('feet-vs-movement'));
  assert(ids.has('attack-vs-feet'));
  assert(ids.has('weapon-not-in-hand'));
  assert(ids.has('shield-too-far'));
  assert(ids.has('shield-not-front'));
  assert(ids.has('shield-not-vertical'));
  assert(ids.has('shield-low-torso-coverage'));
  assert(result.score < 50);
});

test('angle normalization handles wrap-around', () => {
  const a = { x: Math.sin(Math.PI - 0.05), y: 0, z: Math.cos(Math.PI - 0.05) };
  const b = { x: Math.sin(-Math.PI + 0.05), y: 0, z: Math.cos(-Math.PI + 0.05) };
  assert(angleDeg(a, b) < 10);
});
