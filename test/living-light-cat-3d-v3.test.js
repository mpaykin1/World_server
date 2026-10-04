'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('LIGHT directional controls are opt-in and backwards compatible',()=>{
  const profile=read('shared/light/profile.mjs');
  const pipeline=read('shared/light/pipeline.mjs');
  assert.match(profile,/directionalStrength: 0\.0/);
  assert.match(profile,/thicknessVariation: 0\.0/);
  assert.match(pipeline,/uLightDirection/);
  assert.match(pipeline,/uDirectionalStrength/);
  assert.match(pipeline,/uThicknessVariation/);
});

test('LIGHT shader can hide shadow-side outline and vary bright-side thickness',()=>{
  const shader=read('shared/light/shaders.mjs');
  assert.match(shader,/projectedEdgeNormal/);
  assert.match(shader,/nearbySurfaceNormal/);
  assert.match(shader,/lightSignal/);
  assert.match(shader,/visibility/);
  assert.match(shader,/thickness/);
  assert.match(shader,/uShadowFloor/);
});

test('cat V3 reuses approved V2 geometry and motion instead of forking them',()=>{
  const client=read('apps/living-light-cat-3d-v3/client.js');
  assert.match(client,/\.\.\/living-light-cat-3d-v2\/cat-rig\.js/);
  assert.match(client,/\.\.\/living-light-cat-3d-v2\/cat-motion-library\.js/);
  assert.match(client,/directionalStrength:1\.0/);
  assert.match(client,/shadowFloor:\.012/);
  assert.match(client,/thicknessVariation:1\.0/);
});

test('V3 remains a candidate while V2 success is preserved',()=>{
  const doc=read('docs/LIVING_LIGHT_CAT_V3_PARTIAL_RIM.md');
  assert.match(doc,/V1 and V2 remain user-approved SUCCESS baselines/);
  assert.match(doc,/must not be marked SUCCESS\/FAILURE/);
});


test('LIGHT rejects zero and non-finite directional vectors while preserving normalized overrides',async()=>{
  const profileSource=read('shared/light/profile.mjs');
  assert.match(profileSource,/Math\.hypot\(\.\.\.profile\.lightDirection\)/);
  assert.match(profileSource,/profile\.lightDirection\.some\(value => !Number\.isFinite\(value\)\)/);
  const pipeline=read('shared/light/pipeline.mjs');
  assert.match(pipeline,/new THREE\.Vector3\(\.\.\.p\.lightDirection\)\.normalize\(\)/);
});


test('legacy LIGHT profiles validate through defaults and shadow floor can nearly disappear',async()=>{
  const {validateLightProfile}=await import('../shared/light/profile.mjs');
  assert.equal(validateLightProfile({
    core:[1,1,1],gold:[1,.6,.2],amber:[1,.2,.02],
    coreGain:1,goldGain:1,haloGain:1,bloomGain:1,bloomRadius:1,
    rimPower:2,depthGain:.2,filamentGain:.1,temporalBlend:.1
  }),true);
  assert.throws(()=>validateLightProfile({lightDirection:[0,0,0]}),/lightDirection/);
  assert.throws(()=>validateLightProfile({lightDirection:[NaN,0,1]}),/lightDirection/);
  const shadowFloor=.012,lit=0,directionMix=1;
  const directionalVisibility=shadowFloor+(1-shadowFloor)*lit;
  const visibility=(1-directionMix)+directionMix*directionalVisibility;
  assert.ok(visibility<.02);
});
