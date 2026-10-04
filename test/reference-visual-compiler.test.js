'use strict';
const test=require('node:test'),a=require('node:assert/strict');
const {compileReferenceVisual:c,planVisualCorrections:p,analyzeVideoFrames:v,routeVisualGrammar:r}=require('../lib/reference-visual-compiler');
test('routes voxel pixel light watercolor honestly',()=>{
 const x=c({frames:[{style:['voxel','gothic'],tags:['wet stone','fog'],dimension:'3d',lighting:{contrast:.9,fog:.8}},{style:['voxel','gothic'],dimension:'3d'}]});
 a.deepEqual([x.grammar.style,x.route.primary.id,x.plans.geometry.representation],['gothic-voxel','voxel-3d','voxel-occupancy']);a.equal(x.plans.materials[0].class,'stone');
 const s=c({style:['pixel art'],dimension:'2d'});a.deepEqual([s.route.primary.id,s.grammar.camera.mode,s.plans.materials[0].class],['sprite-2d','orthographic','pixel-palette']);
 const l=c({style:'living light',dimension:'3d'});a.deepEqual(l.route.auxiliary.map(x=>x.id),['light-contour-3d','silhouette-3d']);
 const w=c({style:'watercolor',dimension:'3d'});a.deepEqual([w.status,w.route.primary.id,w.route.effectiveStyle],['DEGRADED','mesh-3d','mesh-3d']);
});
test('temporal grammar is stable and does not invent ties',()=>{
 const x=v([{style:'voxel',motion:{types:['walk'],amount:.3}},{style:'voxel',motion:{types:['smoke'],amount:.5}},{style:'gothic',motion:{amount:.4}}]);
 a.deepEqual([x.frameCount,x.dominantStyle,x.styleStability,x.motionAmount],[3,'voxel',.6667,.4]);a.equal(v([{style:'voxel'},{style:'gothic'}]).dominantStyle,null);
});
test('explicit style wins and token matching is strict',()=>{
 a.equal(c({style:'voxel',tags:['GOTHIC']}).grammar.style,'voxel');a.equal(c({tags:['VOXEL','GOTHIC']}).grammar.style,'gothic-voxel');
 a.equal(c({style:'watercolor',tags:['luminous']}).grammar.style,'watercolor');a.notEqual(c({tags:['reluminous']}).grammar.style,'luminous-outline');
});
test('malformed and missing evidence fail soft',()=>{
 const e=c({});a.deepEqual([e.status,e.grammar.dimension,e.route.primary.id,e.plans.materials[0].class],['PLANNED','3d','mesh-3d','generic']);
 a.equal(c({frames:'bad',style:'realistic-3d'}).status,'PLANNED');const u=c({style:'unknown-style',dimension:'3d'});a.deepEqual([u.status,u.route.primary.id],['DEGRADED','mesh-3d']);a.equal(r({style:'realistic-3d'}).primary.id,'mesh-3d');
});
test('numeric and undefined evidence preserve analyzed values',()=>{
 a.equal(c({style:'realistic-3d'}).grammar.lighting.contrast,.55);
 const m=c({frames:[{motion:{amount:.6}},{motion:{amount:.4}}],motion:{amount:null}});a.equal(m.grammar.motion.amount,.5);
 const g=c({frames:[{lighting:{fog:.7,contrast:.6,emissive:.8}}],lighting:{fog:undefined,contrast:undefined,emissive:undefined}}).grammar;
 a.deepEqual([g.lighting.fog,g.lighting.contrast,g.lighting.emissive],[true,.6,true]);a.equal(typeof g.lighting.fog,'boolean');a.equal(typeof g.lighting.emissive,'boolean');
});
test('corrections are prioritized and null safe',()=>{
 const t=c({style:['voxel','gothic']}).grammar,f=p(t,{style:'mesh-3d',contrast:.3,cameraMode:'orthographic',silhouetteFidelity:.4,materialReadability:.5});
 a.equal(f[0].axis,'style');a.equal(f[1].axis,'silhouette');a.ok(f.some(x=>x.axis==='lighting'));a.deepEqual(p(null,null),[]);
});
