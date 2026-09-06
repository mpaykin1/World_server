'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=path.resolve(__dirname,'..');
const c=fs.readFileSync(path.join(R,'apps/ai3d-voxel-city/client.js'),'utf8');
const e=fs.readFileSync(path.join(R,'e2e/ai3d-voxel-city-autoplay.spec.js'),'utf8');
test('ai3d has one DPR owner',()=>{
  assert.doesNotMatch(c,/GoldenPerformanceAutoTune\?\.registerRenderer/);
  assert.match(c,/dynamicPixelRatio>cap\+\.001/);
  assert.doesNotMatch(c,/dynamicPixelRatio=Math\.min\(devicePixelRatio\|\|1,Number\(q\.dpr\)/);
});
test('catastrophic pressure uses existing SAFE tier and .55 floor',()=>{
  assert.match(c,/measuredFps<p\.targetFps\*\.5\)\{next=\.55/);
  assert.match(c,/profileName!=='SAFE'/);
  assert.match(c,/Math\.max\(\.55,Math\.min\(dpr,p\.pixelRatio,next\)\)/);
});
test('performance evidence waits for adaptation convergence',()=>{
  assert.match(c,/actualPixelRatio:renderer\?\.getPixelRatio/);
  assert.match(c,/stableForMs:Math\.max/);
  assert.match(c,/function resetPerformanceWindow/);
  assert.match(e,/dprStable=Math\.abs/);
  assert.match(e,/quality\?\.stableForMs >= 1500/);
  assert.match(e,/timeout: 15000/);
});
test('shared autopilot supports explicit DPR ownership opt-out',()=>{
  const a=fs.readFileSync(path.join(R,'shared/world-quality-autopilot.js'),'utf8');
  assert.match(a,/state\.options\.manageDpr!==false/);
  assert.match(c,/manageDpr:false/);
});
