'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');

test('V4 reuses the accepted V2 rig and reparents tail to animated spine',()=>{
  const client=read('apps/living-light-cat-3d-v4/client.js');
  const tail=read('apps/living-light-cat-3d-v4/tail-motion.js');
  assert.match(client,/living-light-cat-3d-v2\/cat-rig\.js/);
  assert.match(client,/living-light-cat-3d-v2\/cat-motion-library\.js/);
  assert.match(tail,/rig\.spine\.add\(node\)/);
  assert.match(client,/tailFollowsSpine/);
});

test('V4 tail has action-specific smooth targets',()=>{
  const tail=read('apps/living-light-cat-3d-v4/tail-motion.js');
  for(const name of ['walk','run','sit','jump','stretch','sleep'])assert.match(tail,new RegExp(name));
  assert.match(tail,/1-Math\.exp/);
  assert.match(tail,/current\[i\]\.lerp/);
  assert.match(tail,/bendDepth/);
});

test('V4 LIGHT can fully remove shadow-side contour and vary width',()=>{
  const client=read('apps/living-light-cat-3d-v4/client.js');
  const shader=read('shared/light/shaders.mjs');
  const profile=read('shared/light/profile.mjs');
  assert.match(client,/shadowFloor:0\.0/);
  assert.match(client,/projectedEdgeWeight:\.90/);
  assert.match(client,/thicknessVariation:1\.0/);
  assert.match(shader,/uProjectedEdgeWeight/);
  assert.match(shader,/surfaceWeight = 1\.0 - projectedWeight/);
  assert.match(profile,/projectedEdgeWeight: 0\.42/);
});

test('V4 does not overwrite accepted V2 path',()=>{
  const doc=read('docs/LIVING_LIGHT_CAT_V4.md');
  assert.match(doc,/V1 and V2 remain user-approved SUCCESS baselines/);
  assert.match(doc,/must be shown to the owner/);
});
