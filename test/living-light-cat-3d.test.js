'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('Living Light Cat is genuine 3D geometry',()=>{
  const rig=read('apps/living-light-cat-3d/cat-rig.js');
  assert.match(rig,/SphereGeometry/);
  assert.match(rig,/CylinderGeometry/);
  assert.match(rig,/ConeGeometry/);
  assert.match(rig,/TubeGeometry/);
  assert.match(rig,/headPivot/);
  assert.match(rig,/tailSegment/);
});

test('Living Light Cat head and tail move in 3D',()=>{
  const animation=read('apps/living-light-cat-3d/cat-animation.js');
  assert.match(animation,/head\.rotation\.y=headYaw/);
  assert.match(animation,/p\[2\] \+ depth\*u\*0\.28/);
  assert.match(animation,/CatmullRomCurve3/);
  assert.match(animation,/updateTailGeometry/);
});

test('Living Light Cat uses canonical LIGHT rather than a local outline shader',()=>{
  const client=read('apps/living-light-cat-3d/client.js');
  assert.match(client,/\/shared\/light\/index\.mjs/);
  assert.match(client,/new LightPipeline/);
  assert.match(client,/livingGoldProfile/);
  assert.doesNotMatch(client,/ShaderMaterial/);
});

test('Living Light Cat exposes deterministic visual QA poses',()=>{
  const animation=read('apps/living-light-cat-3d/cat-animation.js');
  const client=read('apps/living-light-cat-3d/client.js');
  assert.match(animation,/head-left/);
  assert.match(animation,/head-right/);
  assert.match(animation,/tail-near/);
  assert.match(animation,/tail-far/);
  assert.match(client,/LivingLightCat3D/);
});
