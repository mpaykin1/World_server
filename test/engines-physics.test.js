'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createPhysicsConfig,simulatePhysicsStep,followCamera} = require('../lib/engines/physics.cjs');
const physics = createPhysicsConfig({ world: {
  gravity: 9.81, maxStepMeters: 0.35, solidLayers: ['terrain', 'wall'],
  bodyRadius: 0.2, bodyHeight: 1.4
}});
const floor = { min: {x:-4,y:-1,z:-4}, max:{x:4,y:0,z:4}, layer:'terrain' };
const wall = { min: {x:1,y:0,z:-1}, max:{x:1.2,y:3,z:1}, layer:'wall' };
const step = { min: {x:0.75,y:0,z:1.5}, max:{x:1,y:0.3,z:2.5}, layer:'terrain' };
function run(world, state, dt = 0.1) { return simulatePhysicsStep(physics, {solids:world}, state, dt); }
test('physics requires explicit world parameters and preserves SI contracts', () => {
  assert.deepEqual(physics.step_heights, [0.175, 0.35]);
  assert.equal(physics.collisions.solid, true);
  assert.equal(physics.gravity, 9.81);
  assert.throws(() => createPhysicsConfig({world:{gravity:9.81}}), /maxStepMeters/);
});
test('solid wall stops horizontal movement, including thin barriers', () => {
  let state={position:{x:0.3,y:0,z:0},velocity:{x:100,y:0,z:0}};
  const result=run([floor,wall],state,0.1);
  assert.ok(result.position.x <= 0.8 + 1e-9);
  assert.equal(result.contacts.wall,true);
  assert.equal(result.velocity.x,0);
  assert.equal(state.position.x,0.3);
});
test('a short stair is walkable, a high wall is not', () => {
  const state={position:{x:0.3,y:0,z:2},velocity:{x:3.8,y:0,z:0}};
  const result=run([floor,step],state,0.15);
  assert.ok(result.position.x > 0.8);
  assert.ok(result.position.y >= 0.3 - 1e-8);
  assert.equal(result.contacts.step,true);
});
test('missing a platform results in actual falling, not hidden ground', () => {
  const state={position:{x:6,y:2,z:0},velocity:{x:0,y:0,z:0}};
  const result=run([floor],state,0.2);
  assert.ok(result.position.y < 2);
  assert.equal(result.contacts.ground,false);
});
test('falling player lands on solid platform without tunnelling', () => {
  let state={position:{x:0,y:0.3,z:0},velocity:{x:0,y:-8,z:0}};
  const result=run([floor],state,0.15);
  assert.equal(result.position.y,0);
  assert.equal(result.velocity.y,0);
  assert.equal(result.contacts.ground,true);
});
test('camera follows smoothly without a position copy', () => {
  assert.deepEqual(followCamera({x:0,y:0,z:0},{x:10,y:20,z:30},0.25),
    {x:2.5,y:5,z:7.5});
  assert.throws(() => followCamera({x:0,y:0,z:0},{x:1,y:1,z:1},2), /cannot exceed/);
});

test('step-up cannot lift an unsupported falling or ascending body', () => {
  for (const vertical of [0, 1]) {
    const state = { position: {x:0.3,y:0.1,z:2}, velocity: {x:4,y:vertical,z:0} };
    const result = run([step], state, 0.1);
    assert.equal(result.contacts.step, false);
    assert.equal(result.contacts.ground, false);
    assert.equal(result.contacts.wall, true);
    assert.ok(result.position.x <= step.min.x - physics.bodyRadius + 1e-9);
  }
});

test('leaving an edge clears ground even after earlier supported substeps', () => {
  const result = run([floor], {
    position: {x:3.7,y:0,z:0}, velocity: {x:4,y:0,z:0}
  }, 0.25);
  assert.ok(result.position.x > floor.max.x + physics.bodyRadius);
  assert.ok(result.position.y < 0);
  assert.ok(result.velocity.y < 0);
  assert.equal(result.contacts.ground, false);
});

test('runtime rejects corrupt config instead of producing nonfinite physics', () => {
  const state = { position: {x:0,y:2,z:0}, velocity: {x:0,y:0,z:0} };
  for (const bad of [
    { ...physics, gravity: NaN }, { ...physics, gravity: Infinity },
    { ...physics, bodyRadius: 0 }, { ...physics, bodyHeight: -1 },
    { ...physics, maxStepMeters: 3 }, { ...physics, units: 'pixels' },
    { ...physics, collisions: { solid: false, layers: ['terrain'] } }
  ]) {
    assert.throws(() => simulatePhysicsStep(bad, {solids:[]}, state, 0.1));
  }
  assert.equal(state.position.y, 2);
});
