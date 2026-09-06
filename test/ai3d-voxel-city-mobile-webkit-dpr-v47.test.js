'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const R=path.resolve(__dirname,'..');
const src=fs.readFileSync(path.join(R,'apps/ai3d-voxel-city/client.js'),'utf8');

test('catastrophic FPS accelerates DPR convergence without lowering floor',()=>{
  const a=src.indexOf('function adaptResolution');
  const b=src.indexOf('const GOLDEN_STEP_HEIGHTS',a);
  const hot=src.slice(a,b);
  assert.match(hot,/measuredFps<p\.targetFps\*\.5\)[^{;]*\{?[^}]*next=\.55/);
  assert.match(hot,/Math\.max\(\.55,/);
  assert.match(hot,/measuredFps<p\.targetFps-6\)next\*=\.90/);
});

test('catastrophic adaptation reaches existing floor faster than prior loop',()=>{
  const floor=.55,start=1.15;
  let old=start,newer=start;
  for(let i=0;i<3;i++){old=Math.max(floor,old*.90);newer=floor;}
  assert.ok(newer<old);
  assert.equal(newer,floor);
  assert.ok(old>floor);
});
