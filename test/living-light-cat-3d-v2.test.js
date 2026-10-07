'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=r=>fs.readFileSync(path.join(root,r),'utf8');

test('cat V2 is an articulated quadruped and keeps LIGHT separate',()=>{
  const rig=read('apps/living-light-cat-3d-v2/cat-rig.js');
  const client=read('apps/living-light-cat-3d-v2/client.js');
  for(const s of ['frontNear','frontFar','hindNear','hindFar'])assert.match(rig,new RegExp(s));
  assert.match(rig,/Knee/); assert.match(rig,/tailSegment/);
  assert.match(client,/\/shared\/light\/index\.mjs/); assert.doesNotMatch(client,/ShaderMaterial/);
});

test('cat V2 exposes a broad animation library including transitions',()=>{
  const motion=read('apps/living-light-cat-3d-v2/cat-motion-library.js');
  for(const name of ['idle','walk','run','sitDown','sit','groom','standUp','jump','stretch','lieDown','sleep','rise'])
    assert.match(motion,new RegExp("[\"']"+name+"[\"']"));
  assert.match(motion,/resolveAutoAction/); assert.match(motion,/locomotion/); assert.match(motion,/sitPose/);
});

test('cat V2 preserves donor provenance and permissive integrated sources',()=>{
  const doc=read('docs/LIVING_LIGHT_CAT_MOTION_DONORS.md');
  assert.match(doc,/Low Poly Cat Thing/); assert.match(doc,/Cat Pilot/);
  assert.match(doc,/License: CC0/); assert.match(doc,/Somali Cat Animated ver 1\.2/);
  assert.match(doc,/not integrated as a binary donor/i);
});

test('cat V2 has deterministic per-action QA hook',()=>{
  const client=read('apps/living-light-cat-3d-v2/client.js');
  assert.match(client,/params\.get\('action'\)/); assert.match(client,/LivingLightCatMotion/);
  assert.match(client,/legAngles/); assert.match(client,/tailDepth/);
});
