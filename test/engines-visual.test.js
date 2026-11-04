'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {createStyleSheet,contrast} = require('../lib/engines/visual.cjs');
const physics = { gravity:9.81, units:'SI', collisions:{solid:true,layers:['terrain']} };
function style(seed=34, targetFps=60, laws=['permanent fog']) {
  return createStyleSheet({ physics, world_laws:laws, referenceIds: [],
    performanceBudget:{ targetFps }, randomSeed:seed });
}
test('deterministic original GLSL3 world visual includes four real layers',()=>{
  const a=style();
  assert.deepEqual(a,style());
  assert.deepEqual(a.layers,['far','mid','near','screen']);
  assert.deepEqual(a.tiles,[]);
  assert.deepEqual(a.sprites,[]);
  assert.ok(a.shaders.atmosphere.vertexShader.startsWith('#version 300 es'));
  assert.ok(a.shaders.atmosphere.fragmentShader.includes('fragColor'));
  assert.ok(contrast(a.palette[0],a.palette[2])>=4.5);
  assert.equal(a.requiredRendering.texturesFromUnverifiedSources,false);
});
test('weather law affects lighting, fog and lightning rather than physics',()=>{
  const noStorm=style(17,60,['clear sky']);
  const storm=style(17,60,['storm and rain','tuman']);
  assert.notEqual(noStorm.lighting.fog.density,storm.lighting.fog.density);
  assert.equal(noStorm.lighting.lightningEnabled,false);
  assert.equal(storm.lighting.lightningEnabled,true);
  assert.deepEqual(physics,{gravity:9.81,units:'SI',collisions:{solid:true,layers:['terrain']}});
});
test('low-frame-rate mode reduces shader work and expensive effects',()=>{
  const high=style(20,60);
  const low=style(20,30);
  assert.equal(high.performanceBudget.reducedEffects,false);
  assert.equal(low.performanceBudget.reducedEffects,true);
  assert.equal(low.lighting.bloomEnabled,false);
  assert.equal(low.particles.enabled,false);
  assert.ok(low.shaders.atmosphere.fragmentShader.length<high.shaders.atmosphere.fragmentShader.length);
});
test('unverified references and missing collision guarantees fail closed',()=>{
  assert.throws(()=>createStyleSheet({physics,world_laws:[],referenceIds:['unknown'],
    performanceBudget:{targetFps:60},randomSeed:42}),/licensing/);
  assert.throws(()=>createStyleSheet({physics:{...physics,collisions:{solid:false}},
    world_laws:[],performanceBudget:{targetFps:60},randomSeed:42}),/solid SI/);
  assert.throws(()=>style(20,5),/targetFps/);
});
