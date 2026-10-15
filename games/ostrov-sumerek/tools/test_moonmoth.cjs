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
let segments = 0, rings = 0;
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
  glow: { spark: () => { throw new Error('moonmoth core must not use additive spark'); } },
  ring3: () => { rings++; },
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
assert(Math.max(...def.eyeGlowCol.slice(0, 3)) <= 0.05,
  'moonmoth eye halo exceeds the non-bloom readability budget');
assert(def.look.auraGain <= 0.1, 'moonmoth aura exceeds the dark-silhouette budget');
function trial(strafe) {
  const f = { type: 'moon_moth', def, seed: 1.2, t: 0, alpha: 1,
    vel: new Vector3(), kb: new Vector3(), segs: [], rads: [], state: 'wander',
    timer: 0, target: new Vector3(), hp: def.hp, stun: 0, slow: 0, hold: false };
  f.body = reg.bodies.get(def.body); f.brain = reg.brains.get(def.brain);
  f.body.init(f, 10, 3.45, 6); f.brain.init(f);
  const hero = { x: 6, y: 2.75, z: 6 }, dt = 1 / 60;
  let hits = 0, dives = 0, windups = 0, dodges = 0, invuln = 0;
  let previousMode = f.attackMode, diveHits = 0, lock = null;
  for (let i = 0; i < 1200; i++) {
    hero.x += strafe * dt * 3.5;
    f.t += dt;
    const h = f.segs[0], dxp = hero.x - h.x, dzp = hero.z - h.z;
    const s = { px: hero.x, py: hero.y, pz: hero.z, dxp, dzp,
      dist: Math.hypot(dxp, dzp), prog: 0, canChase: true, chaseR: def.chaseR };
    f.brain.think(f, dt, s);
    if (f.attackMode === 'windup') windups++;
    if (f.attackMode === 'dive') {
      dives++;
      if (previousMode !== 'dive') { lock = [f.aimX, f.aimZ]; diveHits = hits; }
      assert.deepEqual([f.target.x, f.target.z], lock, 'dive target drifted after commit');
    }
    f.body.step(f, dt);
    invuln = Math.max(0, invuln - dt);
    if (invuln === 0 && f.harmful && f.body.touch(f, hero.x, hero.y, hero.z) >= 0) {
      hits++; invuln = 1.5; f.brain.onHurtHero(f);
    }
    if (previousMode === 'dive' && f.attackMode !== 'dive' && hits === diveHits) dodges++;
    previousMode = f.attackMode;
  }
  return { f, hits, dives, windups, dodges };
}
const stationary = trial(0), sidestep = trial(1);
assert(stationary.windups > 0 && stationary.dives > 0, 'missing windup or dive');
assert(stationary.hits >= 1 && stationary.hits <= 3,
  `stationary ${stationary.hits} hits must stay inside existing imp 1..3 hit band`);
assert(sidestep.dodges >= 1, 'natural sidestep never dodged a committed dive');
assert(sidestep.hits < stationary.hits, 'sidestep must take materially fewer hits');
const f = stationary.f, before = f.wingAngle;
f.vel.set(0, 0, 0); f.speed = 0; f.body.step(f, 0);
assert.equal(f.wingAngle, before, 'wings snap at zero speed');
f.attackMode = 'windup'; f.body.render(f); f.body.drawFx(f);
assert(Math.max(...f.wingLight.slice(0, 3)) <= 0.6,
  'moonmoth wing edge exceeds the non-bloom readability budget');
assert(segments >= 5, 'expected body and multiple broad wing ribbons');
assert(rings >= 1, 'windup warning ring did not render');
console.log('PASS: committed target, visible windup, bounded damage, natural sidestep');
console.log(JSON.stringify({ stationary: { hits: stationary.hits },
  sidestep: { hits: sidestep.hits, dodges: sidestep.dodges } }));

