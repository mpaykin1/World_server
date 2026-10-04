'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {compileReferenceVisual,planVisualCorrections,analyzeVideoFrames,routeVisualGrammar}=require('../lib/reference-visual-compiler');

test('gothic voxel video routes to voxel 3D',()=>{
  const r=compileReferenceVisual({sourceType:'video',frames:[
    {style:['voxel','gothic'],objects:['cathedral','bridge','spire'],tags:['wet stone','warm windows','fog'],dimension:'3d',lighting:{contrast:.92,fog:.8,emissive:.75},camera:{mode:'perspective'}},
    {style:['voxel','gothic'],objects:['tower','arch'],tags:['wet stone','warm windows'],dimension:'3d',lighting:{contrast:.88,fog:.7,emissive:.8},camera:{mode:'perspective'}}]});
  assert.equal(r.grammar.style,'gothic-voxel');assert.equal(r.route.primary.id,'voxel-3d');assert.equal(r.plans.geometry.representation,'voxel-occupancy');
  assert.equal(r.plans.lighting.volumetricFog,true);assert.equal(r.plans.materials[0].class,'stone');assert.equal(r.plans.materials[0].wet,true);
  assert.ok(r.executableSystems.includes('lib/world-quality-voxel-enhancer.js'));
});
test('2D pixel reference routes to sprite lane',()=>{
  const r=compileReferenceVisual({style:['pixel art','sprite'],dimension:'2d',tags:['limited palette'],palette:['#17131a','#64515c','#f0c97a']});
  assert.equal(r.grammar.style,'pixel-art');assert.equal(r.route.primary.id,'sprite-2d');assert.equal(r.plans.geometry.representation,'sprite-regions');
  assert.equal(r.grammar.camera.mode,'orthographic');assert.equal(r.plans.materials[0].class,'pixel-palette');
});
test('luminous 3D adds LIGHT and silhouette lanes',()=>{
  const r=compileReferenceVisual({style:['living light','luminous outline'],dimension:'3d',tags:['gold','amber','glow']});
  assert.equal(r.grammar.style,'luminous-outline');assert.equal(r.route.primary.id,'mesh-3d');
  assert.deepEqual(r.route.auxiliary.map(x=>x.id),['light-contour-3d','silhouette-3d']);assert.equal(r.plans.lighting.useLightSystem,true);
});
test('missing watercolor runtime is honest',()=>{
  const r=compileReferenceVisual({style:'watercolor',dimension:'3d',objects:['house','tree']});
  assert.equal(r.grammar.style,'watercolor');assert.equal(r.route.primary.id,'mesh-3d');assert.equal(r.status,'DEGRADED');assert.equal(r.route.effectiveStyle,'mesh-3d');assert.ok(r.blockers.some(x=>x.includes('absent from current master')));
});
test('video analyzer aggregates temporal grammar',()=>{
  const t=analyzeVideoFrames([{style:'voxel',motion:{types:['walk'],amount:.3}},{style:'voxel',motion:{types:['walk','smoke'],amount:.5}},{style:'gothic',motion:{types:['walk'],amount:.4}}]);
  assert.equal(t.frameCount,3);assert.equal(t.dominantStyle,'voxel');assert.equal(t.styleStability,.6667);assert.deepEqual(t.motionTypes,['walk','smoke']);assert.equal(t.motionAmount,.4);
});
test('correction planner prioritizes style and silhouette',()=>{
  const t=compileReferenceVisual({style:['voxel','gothic'],dimension:'3d'}).grammar;
  const f=planVisualCorrections(t,{style:'mesh-3d',contrast:.3,cameraMode:'orthographic',silhouetteFidelity:.4,materialReadability:.5});
  assert.equal(f[0].axis,'style');assert.equal(f[1].axis,'silhouette');assert.ok(f.some(x=>x.axis==='lighting'));assert.ok(f.some(x=>x.axis==='camera'));
});

test('empty reference fails soft and defaults to callable 3D planning',()=>{
  const r=compileReferenceVisual({});
  assert.equal(r.status,'PLANNED');
  assert.equal(r.grammar.dimension,'3d');
  assert.equal(r.route.primary.id,'mesh-3d');
});
test('public router normalizes missing dimension to 3D',()=>{
  const r=routeVisualGrammar({style:'realistic-3d',lighting:{}});
  assert.equal(r.primary.id,'mesh-3d');
});

test('missing contrast uses visual fallback instead of Number(null)',()=>{
  const r=compileReferenceVisual({dimension:'3d',style:'realistic-3d'});
  assert.equal(r.grammar.lighting.contrast,0.55);
});
test('style mode reports no false dominant style on a tie',()=>{
  const r=analyzeVideoFrames([{style:'voxel'},{style:'gothic'}]);
  assert.equal(r.dominantStyle,null);
});
test('uppercase semantic tags normalize before style inference',()=>{
  const r=compileReferenceVisual({style:'voxel',tags:['GOTHIC'],dimension:'3d'});
  assert.equal(r.grammar.style,'gothic-voxel');
});

test('explicit watercolor style is not replaced by luminous lighting tags',()=>{
  const r=compileReferenceVisual({style:'watercolor',tags:['luminous'],dimension:'3d'});
  assert.equal(r.grammar.style,'watercolor');assert.equal(r.status,'DEGRADED');
});
test('substring fragments do not masquerade as style tokens',()=>{
  const r=compileReferenceVisual({tags:['reluminous'],dimension:'3d'});
  assert.notEqual(r.grammar.style,'luminous-outline');
});
test('null motion amount falls back instead of becoming numeric zero',()=>{
  const t=analyzeVideoFrames([{motion:{amount:.6}},{motion:{amount:.4}}]);
  assert.equal(t.motionAmount,.5);
  const r=compileReferenceVisual({frames:[{motion:{amount:.6}},{motion:{amount:.4}}],motion:{amount:null}});
  assert.equal(r.grammar.motion.amount,.5);
});
test('watercolor degraded route exposes unavailable exact lane and still has a material plan',()=>{
  const r=compileReferenceVisual({style:'watercolor',dimension:'3d'});
  const lane=r.route.ranked.find(x=>x.id==='watercolor-3d');
  assert.equal(lane.available,false);assert.ok(r.plans.materials.length>0);
});

test('partial lighting override preserves analyzed frame evidence',()=>{
  const r=compileReferenceVisual({frames:[{lighting:{fog:.3,contrast:.4}}],lighting:{emissive:.5,fog:undefined}});
  assert.equal(r.grammar.lighting.fog,true);assert.equal(r.grammar.lighting.contrast,.4);assert.equal(r.grammar.lighting.emissive,true);
});
test('correction planner fails soft on null target and observed inputs',()=>{
  assert.deepEqual(planVisualCorrections(null,null),[]);
});

test('malformed frames input fails soft instead of throwing',()=>{
  const r=compileReferenceVisual({frames:'invalid',style:'realistic-3d'});assert.equal(r.status,'PLANNED');
});
test('unknown explicit style degrades to a callable lane without false certainty',()=>{
  const r=compileReferenceVisual({style:'unknown-reference-style',dimension:'3d'});
  assert.equal(r.status,'DEGRADED');assert.equal(r.route.primary.id,'mesh-3d');assert.equal(r.route.effectiveStyle,'mesh-3d');
});
test('empty reference always receives a concrete generic material',()=>{
  const r=compileReferenceVisual({});assert.equal(r.plans.materials[0].class,'generic');
});
