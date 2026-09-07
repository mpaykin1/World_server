'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const {
  POLICY,profileFor,tierFor,clampTierToCeiling,semanticFromBlock,
  inferSemanticFromName,colorSemantic,selectRepresentation,validatePolicy
}=require('../lib/world-quality-microdetail-policy');
const ROOT=path.resolve(__dirname,'..'),read=rel=>fs.readFileSync(path.join(ROOT,rel),'utf8');

test('single microdetail policy validates',()=>assert.deepEqual(validatePolicy(),{ok:true,errors:[]}));
test('face stays subtler than skin and scales',()=>{
  assert.ok(profileFor('face').amplitude<profileFor('skin').amplitude);
  assert.ok(profileFor('skin').amplitude<profileFor('scales').amplitude);
  assert.ok(profileFor('face').priority>.9);
});
test('smooth materials never create physical microgeometry',()=>{
  assert.equal(selectRepresentation({semantic:'smooth',distance:.1,tier:'ULTRA'}),'flat');
  assert.equal(semanticFromBlock(8),'smooth');assert.equal(semanticFromBlock(9),'smooth');
});
test('representation degrades geometry to shader to flat with distance',()=>{
  assert.equal(selectRepresentation({semantic:'weapon',distance:2,tier:'HIGH'}),'geometry');
  assert.equal(selectRepresentation({semantic:'weapon',distance:15,tier:'HIGH'}),'shader');
  assert.equal(selectRepresentation({semantic:'weapon',distance:100,tier:'HIGH'}),'flat');
});
test('tier budgets grow monotonically',()=>{
  const tiers=POLICY.tierOrder.map(tierFor);
  for(let i=1;i<tiers.length;i++){
    assert.ok(tiers[i].geometryDistance>tiers[i-1].geometryDistance);
    assert.ok(tiers[i].maxDetailedFacesPerMesh>=tiers[i-1].maxDetailedFacesPerMesh);
  }
});
test('local runtime can never exceed global quality ceiling',()=>{
  assert.equal(clampTierToCeiling('ULTRA','HIGH'),'HIGH');
  assert.equal(clampTierToCeiling('SAFE','HIGH'),'SAFE');
});
test('semantic inference covers animals faces armor and weapons',()=>{
  assert.equal(inferSemanticFromName('Dragon_Scales_LOD0'),'scales');
  assert.equal(inferSemanticFromName('Wolf_Muzzle'),'face');
  assert.equal(inferSemanticFromName('Knight_Helmet'),'armor');
  assert.equal(inferSemanticFromName('Steel_Sword_Blade'),'weapon');
  assert.equal(inferSemanticFromName('Character_Shirt'),'fabric');
});
test('skin-like material colors get skin semantic',()=>{
  assert.equal(colorSemantic([240,190,146]),'skin');
});
test('bootstrap preserves exact orthographic mode and restores base geometry',()=>{
  const source=read('shared/graphics/universal-voxel-microdetail-bootstrap.js');
  assert.match(source,/camera\?\.isOrthographicCamera/);
  assert.match(source,/restoreAfterRender/);
  assert.match(source,/record\.mesh\.geometry=record\.baseGeometry/);
});
test('both voxel renderers load one shared bootstrap',()=>{
  const needle='/shared/graphics/universal-voxel-microdetail-bootstrap.js';
  assert.ok(read('apps/voxel-world/index.html').includes(needle));
  assert.ok(read('apps/ai3d-voxel-city/index.html').includes(needle));
});
test('world quality autopilot owns the structural audit',()=>{
  const source=read('scripts/world-quality-autopilot.js');
  assert.ok(source.includes("'world-microdetail-audit.js'"));
  assert.ok(source.includes('microdetailPercent:'));
});

test('shader injection never depends on conditional worldPosition variable',()=>{
  const source=read('shared/graphics/universal-voxel-microdetail.js');
  assert.ok(source.includes('vMicroWorldPos=(modelMatrix*vec4(transformed,1.0)).xyz'));
  assert.ok(!source.includes('vMicroWorldPos=worldPosition.xyz'));
});

test('UTF-8 Russian UI is preserved after microdetail bootstrap insertion',()=>{
  const source=read('apps/ai3d-voxel-city/index.html');
  assert.ok(source.includes('Картинка → город из кубиков'));
  assert.ok(!source.includes('РљР°СЂС‚РёРЅРєР°'));
});
