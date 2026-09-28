import test from 'node:test';
import assert from 'node:assert/strict';
import {DEPTH,PALETTE,seededRandom,wrapOffset,layerOffset} from '../shared/graphics/pixel-parallax.mjs';
test('five depths, sky fixed, foreground fastest',()=>{
 assert.equal(DEPTH.sky,0);
 assert.ok(DEPTH.clouds<DEPTH.skyline&&DEPTH.skyline<DEPTH.city&&DEPTH.city<DEPTH.foreground);
 assert.equal(layerOffset(100,DEPTH.sky),0);
 assert.equal(layerOffset(100,DEPTH.city),55);
});
test('negative and repeated camera positions have seamless wrap',()=>{
 for(const v of [-1931,-960,-959,-1,0,17,960,1921]){
  assert.ok(wrapOffset(v,960)>=0&&wrapOffset(v,960)<960);
  assert.equal(wrapOffset(v,960),wrapOffset(v+960*3,960));
 }
 assert.equal(layerOffset(-400,1,960),560);
 assert.throws(()=>wrapOffset(3,0),RangeError);
 assert.throws(()=>layerOffset(1,-1),RangeError);
});
test('deterministic seeded procedural geometry and palette',()=>{
 const a=seededRandom(7319),b=seededRandom(7319),c=seededRandom(7320);
 const first=Array.from({length:15},()=>a());
 assert.deepEqual(first,Array.from({length:15},()=>b()));
 assert.notDeepEqual(first,Array.from({length:15},()=>c()));
 assert.match(PALETTE.window,/^#[0-9a-f]{6}$/);
});
test('module can be imported in headless Node without DOM',()=>{
 assert.equal(typeof globalThis.document,'undefined');
 assert.equal(typeof DEPTH.foreground,'number');
});