'use strict';
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.resolve(__dirname, '../packs/moonmoth');
class Vector3 {
  constructor(x = 0, y = 0, z = 0) { this.set(x, y, z); }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  multiplyScalar(k) { this.x *= k; this.y *= k; this.z *= k; return this; }
}
const reg = { bodies: new Map(), brains: new Map(), enemies: new Map() };
let segments = 0, glows = 0;
const sandbox = {
  THREE: { Vector3 }, Math, SEA: 0, W: 64, D: 64,
  toColor: (c) => c, terrainTop: () => 2,
  damp: (rate, dt) => 1 - Math.exp(-rate * dt),
  clamp: (x, a, b) => Math.max(a, Math.min(b, x)), rr: (a, b) => (a + b) / 2,
  defineBody: (id, b) => { assert(!reg.bodies.has(id)); reg.bodies.set(id, b); },
  defineBrain: (id, b) => { assert(!reg.brains.has(id)); reg.brains.set(id, b); },
  defineEnemy: (id, e) => { assert(!reg.enemies.has(id)); reg.enemies.set(id, e); },
  putSegment: () => { segments++; },
  ribbons: { seg: () => { segments++; } },
  glow: { spark: () => { glows++; } },
};
vm.createContext(sandbox);
const foeSource = fs.readFileSync(path.resolve(base, '../../engine/68_foes.js'), 'utf8');
const actualSteering = foeSource.match(/function steerFoe\(f, dt\) \{[\s\S]*?\n\}/);
assert(actualSteering, 'production steerFoe not found');
vm.runInContext(actualSteering[0], sandbox, { filename: 'engine/68_foes.js' });
for (const file of ['bodies.js', 'brains.js', 'enemies.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), sandbox, { filename: file });
}
const def = reg.enemies.get('moon_moth');
assert(def && reg.bodies.has(def.body) && reg.brains.has(def.brain));
assert.equal(def.spawn.max({ tod: 0.2, collected: 20 }), 0);
assert.equal(def.spawn.max({ tod: 0.6, collected: 20 }), 2);
assert.equal(def.spawn.biomes[0], 'dusk');
const f = {
  type: 'moon_moth', def, seed: 1.2, t: 0, alpha: 1,
  vel: new Vector3(), kb: new Vector3(), segs: [], rads: [],
  state: 'wander', timer: 0, target: new Vector3(), hp: def.hp,
  stun: 0, slow: 0, hold: false,
};
f.body = reg.bodies.get(def.body); f.brain = reg.brains.get(def.brain);
f.body.init(f, 10, 3.45, 6); f.brain.init(f);
assert.equal(f.segs.length, 1);
const hero = { x: 6, y: 2.75, z: 6 }, dt = 1 / 60;
let hits = 0, dives = 0, retreats = 0, minDistance = Infinity, invuln = 0;
for (let i = 0; i < 1200; i++) {
  f.t += dt;
  const h = f.segs[0];
  const dxp = hero.x - h.x, dzp = hero.z - h.z;
  const dist = Math.hypot(dxp, dzp);
  const s = { px: hero.x, py: hero.y, pz: hero.z, dxp, dzp, dist,
    prog: 0, canChase: true, chaseR: def.chaseR };
  f.brain.think(f, dt, s);
  if (f.attackMode === 'dive') dives++;
  f.body.step(f, dt);
  minDistance = Math.min(minDistance, Math.hypot(hero.x - h.x, hero.y - h.y, hero.z - h.z));
  invuln = Math.max(0, invuln - dt);
  if (invuln === 0 && f.harmful && f.body.touch(f, hero.x, hero.y, hero.z) >= 0) {
    hits++; invuln = 1.5; f.brain.onHurtHero(f);
  }
  if (f.state === 'flee') retreats++;
}
assert(dives > 0, 'no actual dive phase');
assert(minDistance < def.rad + 0.35, 'never enters real 3D hit range');
assert(hits >= 1, 'no damage to stationary hero in 20 simulated seconds');
assert(retreats > 0, 'no post-hit retreat');
const before = f.wingAngle;
f.vel.set(0, 0, 0); f.speed = 0;
f.body.step(f, 0);
assert.equal(f.wingAngle, before, 'wings snap at zero speed');
f.body.render(f); f.body.drawFx(f);
assert(segments >= 5, 'expected body and multiple broad wing ribbons');
assert.equal(glows, 1);
console.log('PASS: production steering, 3D contact, timed dive, retreat, smooth wings');
console.log(JSON.stringify({ hits, dives, retreats, minDistance: +minDistance.toFixed(3) }));
