'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs');
const os=require('os');
const path=require('path');
const {AI3D_DELIVERY_POLICY,validateSceneDeliveryManifest,validateFinalDeliveryStatus}=require('../lib/ai3d-delivery-policy');
const SHA_A='a'.repeat(64), SHA_B='b'.repeat(64);
function goodManifest(scenePath='/apps/gothic-voxel-city/') { return {
  schema:'ai3d-scene-delivery-v1', playable:true, walkable:true, mouseLook:true, collisions:true, grounding:true, playerSpawn:true,
  controls:['WASD','ARROW_KEYS','MOUSE_LOOK'], publicScenePath:scenePath, finalPresentation:'PLAYABLE_SCENE', multiViewGeometryStatus:'VERIFIED_VOLUMETRIC',
  heightfieldDominant:false, reliefDominant:false, billboardLike:false, connectedArchitecturalMasses:12, walkableAreaCells:5000,
  referenceFidelity:{status:'VERIFIED',structuralSimilarity:.61,edgeSimilarity:.42,silhouetteSimilarity:.79,colorSimilarity:.72,verifier:'ai3d-independent-verifier-v3',referenceSha256:SHA_A,renderSha256:SHA_B}
}; }

test('policy requires playable and maximal reference fidelity',()=>{assert.equal(AI3D_DELIVERY_POLICY.sceneDeliveryRequired,true);assert.equal(AI3D_DELIVERY_POLICY.diagnosticViewerIsFinalDeliverable,false);assert.equal(AI3D_DELIVERY_POLICY.referenceFidelity.heightfieldDominantIsFailureForCity,true);});
test('good ready-quality scene manifest passes',()=>assert.deepEqual(validateSceneDeliveryManifest(goodManifest(),{requireReadyQuality:true}),[]));
for(const [name,mutate,needle] of [
  ['not walkable',m=>m.walkable=false,'walkable'],['no mouse look',m=>m.mouseLook=false,'mouseLook'],['no collisions',m=>m.collisions=false,'collisions'],['no grounding',m=>m.grounding=false,'grounding'],['no spawn',m=>m.playerSpawn=false,'playerSpawn'],['missing arrows',m=>m.controls=['WASD','MOUSE_LOOK'],'ARROW_KEYS'],['diagnostic final',m=>m.publicScenePath='/apps/ai3d-reference-test/','diagnostic'],['orbit final',m=>m.finalPresentation='ORBIT_VIEWER','PLAYABLE_SCENE'],['heightfield',m=>m.heightfieldDominant=true,'heightfield'],['relief',m=>m.reliefDominant=true,'relief'],['billboard',m=>m.billboardLike=true,'billboard'],['one mass',m=>m.connectedArchitecturalMasses=1,'connectedArchitecturalMasses'],['zero walkable area',m=>m.walkableAreaCells=0,'walkableAreaCells'],['SSIM low',m=>m.referenceFidelity.structuralSimilarity=.18,'below minimum'],['edge low',m=>m.referenceFidelity.edgeSimilarity=.025,'below minimum'],['silhouette low',m=>m.referenceFidelity.silhouetteSimilarity=.30,'below minimum'],['color low',m=>m.referenceFidelity.colorSimilarity=.10,'below minimum'],['visual untested',m=>m.referenceFidelity.status='UNTESTED','must be VERIFIED'],['relief multiview',m=>m.multiViewGeometryStatus='RELIEF_DOMINANT','multiViewGeometryStatus']
]) test(`false final claim blocked: ${name}`,()=>{const m=goodManifest();mutate(m);const errors=validateSceneDeliveryManifest(m,{requireReadyQuality:true});assert.ok(errors.length>0);assert.ok(errors.some(x=>x.toLowerCase().includes(needle.toLowerCase())),errors.join('; '));});

test('NOT_READY is valid',()=>assert.deepEqual(validateFinalDeliveryStatus({schema:'ai3d-final-delivery-status-v1',status:'NOT_READY_FOR_FINAL_DELIVERY',finalScenePath:null,reason:'No scene passed gate'},{repoRoot:process.cwd()}),[]));
test('READY cannot point to diagnostic',()=>{const e=validateFinalDeliveryStatus({schema:'ai3d-final-delivery-status-v1',status:'READY_FOR_FINAL_DELIVERY',finalScenePath:'/apps/ai3d-reference-test/'},{repoRoot:process.cwd()});assert.ok(e.some(x=>x.includes('diagnostic')));});
test('READY validates actual files and manifest',()=>{const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'ai3d-delivery-'));const app=path.join(tmp,'apps','gothic-voxel-city');fs.mkdirSync(app,{recursive:true});fs.writeFileSync(path.join(app,'index.html'),'<b>AI3D_PLAYABLE_SCENE WASD стрелки мышь</b>');fs.writeFileSync(path.join(app,'client.js'),'console.log("playable")');fs.writeFileSync(path.join(app,'scene-delivery.json'),JSON.stringify(goodManifest()));const e=validateFinalDeliveryStatus({schema:'ai3d-final-delivery-status-v1',status:'READY_FOR_FINAL_DELIVERY',finalScenePath:'/apps/gothic-voxel-city/'},{repoRoot:tmp});assert.deepEqual(e,[]);});
