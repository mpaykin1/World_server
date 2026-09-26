import test from 'node:test';import assert from 'node:assert/strict';
import {sampleOriginalFaceCorners} from '../shared/original-face-corner-shading.mjs';
test('unoccluded corners preserve face shade and uniform light',()=>{
 const r=sampleOriginalFaceCorners({position:[0,0,0],normal:[0,1,0],sample:()=>({solid:false,sky:15})});
 assert.deepEqual(r.corners.map(c=>c.occlusion),[0,0,0,0]);
 assert.deepEqual(r.corners.map(c=>c.light),[15,15,15,15]);
});
test('two adjacent opaque neighbors fully occlude a corner',()=>{
 const r=sampleOriginalFaceCorners({position:[1,1,1],normal:[0,1,0],sample:(x,y,z)=>({solid:y===2&&((x===0&&z===1)||(x===1&&z===0)),sky:10})});
 assert.equal(r.corners[0].occlusion,3);assert.equal(r.corners[0].brightness,0.45);
 assert.equal(r.corners[2].occlusion,0);
});
test('works on x face and rejects malformed normals',()=>{
 const r=sampleOriginalFaceCorners({position:[1,1,1],normal:[1,0,0],sample:()=>({solid:false,block:7})});
 assert.equal(r.corners.length,4);assert.equal(r.corners[0].light,7);
 assert.throws(()=>sampleOriginalFaceCorners({position:[0,0,0],normal:[1,1,0],sample:()=>({})}),TypeError);
});
