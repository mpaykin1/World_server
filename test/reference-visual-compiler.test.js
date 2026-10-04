'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileReferenceVisual:c,planVisualCorrections:p,analyzeVideoFrames:a,routeVisualGrammar:r}=require('../lib/reference-visual-compiler');

test('routes core visual families to honest lanes',()=>{
  const voxel=c({sourceType:'video',frames:[
    {style:['voxel','gothic'],objects:['cathedral','bridge'],tags:['wet stone','fog'],dimension:'3d',lighting:{contrast:.92,fog:.8}},
    {style:['voxel','gothic'],objects:['tower'],tags:['warm windows'],dimension:'3d',lighting:{contrast:.88,emissive:.8}}]});
  assert.deepEqual([voxel.grammar.style,voxel.route.primary.id,voxel.plans.geometry.representation],['gothic-voxel','voxel-3d','voxel-occupancy']);
  assert.equal(voxel.plans.materials[0].class,'stone');assert.equal(voxel.plans.lighting.volumetricFog,true);
  const pixel=c({style:['pixel art','sprite'],dimension:'2d',palette:['#17131a','#f0c97a']});
  assert.deepEqual([pixel.grammar.style,pixel.route.primary.id,pixel.grammar.camera.mode,pixel.plans.materials[0].class],['pixel-art','sprite-2d','orthographic','pixel-palette']);
  const light=c({style:['living light'],dimension:'3d',tags:['gold']});
  assert.equal(light.status,'PLANNED');assert.deepEqual(light.route.auxiliary.map(x=>x.id),['light-contour-3d','silhouette-3d']);
  const watercolor=c({style:'watercolor',dimension:'3d'});
  assert.equal(watercolor.status,'DEGRADED');assert.equal(watercolor.route.effectiveStyle,'mesh-3d');
  assert.equal(watercolor.route.ranked.find(x=>x.id==='watercolor-3d').available,false);assert.ok(watercolor.plans.materials.length);
});

test('temporal aggregation is stable and ties are not invented',()=>{
  const x=a([{style:'voxel',motion:{types:['walk'],amount:.3}},{style:'voxel',motion:{types:['walk','smoke'],amount:.5}},{style:'gothic',motion:{types:['walk'],amount:.4}}]);
  assert.deepEqual([x.frameCount,x.dominantStyle,x.styleStability,x.motionAmount],[3,'voxel',.6667,.4]);assert.deepEqual(x.motionTypes,['walk','smoke']);
  assert.equal(a([{style:'voxel'},{style:'gothic'}]).dominantStyle,null);
});

test('explicit style semantics resist tag ambiguity and substrings',()=>{
  assert.equal(c({style:'voxel',tags:['GOTHIC'],dimension:'3d'}).grammar.style,'voxel');
  assert.equal(c({tags:['VOXEL','GOTHIC'],dimension:'3d'}).grammar.style,'gothic-voxel');
  assert.equal(c({style:'watercolor',tags:['luminous'],dimension:'3d'}).grammar.style,'watercolor');
  assert.notEqual(c({tags:['reluminous'],dimension:'3d'}).grammar.style,'luminous-outline');
});

test('missing and malformed evidence degrades or defaults safely',()=>{
  const empty=c({});assert.deepEqual([empty.status,empty.grammar.dimension,empty.route.primary.id,empty.plans.materials[0].class],['PLANNED','3d','mesh-3d','generic']);
  assert.equal(c({frames:'invalid',style:'realistic-3d'}).status,'PLANNED');
  const unknown=c({style:'unknown-reference-style',dimension:'3d'});
  assert.deepEqual([unknown.status,unknown.route.primary.id,unknown.route.effectiveStyle],['DEGRADED','mesh-3d','mesh-3d']);
  assert.equal(r({style:'realistic-3d',lighting:{}}).primary.id,'mesh-3d');
});

test('numeric fallbacks preserve measured lighting and motion',()=>{
  assert.equal(c({dimension:'3d',style:'realistic-3d'}).grammar.lighting.contrast,.55);
  const motion=c({frames:[{motion:{amount:.6}},{motion:{amount:.4}}],motion:{amount:null}});assert.equal(motion.grammar.motion.amount,.5);
  const lighting=c({frames:[{lighting:{fog:.3,contrast:.4}}],lighting:{emissive:.5,fog:undefined}});
  assert.deepEqual([lighting.grammar.lighting.fog,lighting.grammar.lighting.contrast,lighting.grammar.lighting.emissive],[true,.4,true]);
});

test('correction planner is prioritized and null-safe',()=>{
  const target=c({style:['voxel','gothic'],dimension:'3d'}).grammar;
  const fixes=p(target,{style:'mesh-3d',contrast:.3,cameraMode:'orthographic',silhouetteFidelity:.4,materialReadability:.5});
  assert.equal(fixes[0].axis,'style');assert.equal(fixes[1].axis,'silhouette');assert.ok(fixes.some(x=>x.axis==='lighting'));assert.ok(fixes.some(x=>x.axis==='camera'));
  assert.deepEqual(p(null,null),[]);
});
