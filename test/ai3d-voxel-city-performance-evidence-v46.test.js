'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const R=path.resolve(__dirname,'..');
const client=()=>fs.readFileSync(path.join(R,'apps/ai3d-voxel-city/client.js'),'utf8');
const spec=()=>fs.readFileSync(path.join(R,'e2e/ai3d-voxel-city-autoplay.spec.js'),'utf8');

test('runtime exposes stable-window performance evidence',()=>{
  const s=client();
  assert.match(s,/frameTimeSamples/);
  assert.match(s,/function performanceSnapshot\(\)/);
  assert.match(s,/p95FrameMs/);
  assert.match(s,/longFrameRatio/);
  assert.match(s,/samples:samples\.length/);
  assert.match(s,/performance:performanceSnapshot\(\)/);
});

test('autoplay rejects startup fps zero and waits for stable sample window',()=>{
  const s=spec();
  assert.match(s,/s\?\.fps > 0/);
  assert.match(s,/s\?\.performance\?\.samples >= 30/);
  assert.match(s,/s\?\.performance\?\.p95FrameMs > 0/);
  assert.match(s,/expect\(stats\.fps\)\.toBeGreaterThan\(0\)/);
  assert.match(s,/longFrameRatio/);
});

test('canvas proof uses portable screenshot instead of browser-dependent dataURL length',()=>{
  const s=spec();
  assert.match(s,/locator\('#viewer canvas'\)\.screenshot\(\)/);
  assert.match(s,/canvasShot\.length\)\.toBeGreaterThan\(1000\)/);
  assert.doesNotMatch(s,/canvasInfo\.dataLen\)\.toBeGreaterThan\(1000\)/);
});

test('performance evidence does not weaken FPS thresholds',()=>{
  const s=spec();
  assert.doesNotMatch(s,/expect\(stats\.fps\)\.toBeGreaterThanOrEqual\(\s*0\s*\)/);
});
