'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { MatterCamera } = require('../lib/world-matter-camera');
const { MatterParticleSystem } = require('../lib/world-matter-particles');
const { SpriteAnimator, SpriteEntity } = require('../lib/world-sprite-runtime');
const { NoitaRuntime } = require('../lib/world-noita-runtime');

test('camera keeps world/screen transforms reversible and pixel scale integral', () => {
  const camera = new MatterCamera({x:10,y:20,zoom:1.37,width:390,height:844,baseCellPixels:3});
  const p = camera.worldToScreen(14,27);
  const w = camera.screenToWorld(p.x,p.y);
  assert.ok(Math.abs(w.x-14)<1e-9);
  assert.ok(Math.abs(w.y-27)<1e-9);
  assert.equal(Number.isInteger(camera.cellPixels()),true);
});

test('camera supports cuts, animated zoom and decaying shake', () => {
  const camera = new MatterCamera({width:400,height:300});
  camera.cutTo(20,30,2);
  assert.equal(camera.x,20);
  camera.animateTo(40,50,4);
  camera.shake(1,.1);
  camera.update(.05);
  assert.ok(camera.x>20&&camera.x<40);
  assert.ok(camera.zoom>2&&camera.zoom<4);
  assert.notEqual(camera.shakeOffset.x,0);
  camera.update(.2);
  assert.equal(camera.shakeTime,0);
});

test('particle bridge turns matter events into transient visual particles', () => {
  const particles = new MatterParticleSystem({seed:2,max:100});
  particles.consume([
    {type:'ignite',at:[2,3,0]},
    {type:'reaction',reaction:'lava-water',at:[5,6,0]},
    {type:'cluster-shatter',at:[8,9,0],count:12}
  ]);
  const created = particles.stats().count;
  assert.ok(created>=30);
  for(let i=0;i<240;i++) particles.step(1/60);
  assert.equal(particles.stats().count,0);
});

test('sprite animator advances clips and entity flips toward movement', () => {
  const animator = new SpriteAnimator({
    clips:{
      idle:{frames:[0],fps:1,loop:true},
      walk:{frames:[1,2,3,4],fps:8,loop:true},
      air:{frames:[5],fps:1,loop:true}
    }
  });
  const entity = new SpriteEntity({animator,x:5,y:2,speed:6,gravity:-20});
  const solid = (x,y) => y<=0;
  entity.move(-1);
  for(let i=0;i<30;i++) entity.update(1/60,solid);
  assert.equal(animator.flipX,true);
  assert.ok(entity.x<5);
  assert.equal(entity.onGround,true);
  assert.equal(animator.clipName,'walk');
  animator.update(.2);
  assert.ok([1,2,3,4].includes(animator.currentFrame()));
});

test('dense fire can ignite sparse structural wood through the bridge', () => {
  const runtime = new NoitaRuntime({width:32,height:24,seed:6});
  runtime.sparse.setCell(10,1,0,'wood');
  runtime.dense.set(9,1,'fire');
  runtime.step(1/60);
  assert.equal(runtime.sparse.getCell(10,1,0)?.burning,true);
  assert.ok(runtime.lastEvents.some(e=>e.type==='ignite'&&e.source==='dense'));
});

test('Noita runtime composes dense matter, sparse structures, particles and camera', () => {
  const runtime = new NoitaRuntime({width:64,height:48,seed:5});
  runtime.dense.set(20,20,'lava');
  runtime.dense.set(21,20,'water');
  runtime.sparse.setCell(5,0,0,'stone');
  runtime.sparse.setCell(5,4,0,'wood');
  runtime.sparse.setCell(6,4,0,'wood');
  const detached = runtime.detachUnsupported({minCells:2});
  assert.equal(detached.length,1);
  const result = runtime.step(1/60);
  assert.ok(result.events>0);
  assert.ok(runtime.particles.stats().count>0);
  assert.ok(runtime.renderSources().length===2);
});
