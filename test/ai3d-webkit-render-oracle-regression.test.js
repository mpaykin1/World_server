const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
test('AI3D WebKit render proof uses screenshot bytes, never dataURL length threshold',()=>{
  const src=fs.readFileSync(path.join(process.cwd(),'e2e','ai3d-voxel-city-autoplay.spec.js'),'utf8');
  assert.match(src,/locator\('#viewer canvas'\)\.screenshot\(\)/);
  assert.match(src,/canvasShot\.length\)\.toBeGreaterThan\(1000\)/);
  assert.doesNotMatch(src,/canvasInfo\.dataLen\)\.toBeGreaterThan\(/);
});
