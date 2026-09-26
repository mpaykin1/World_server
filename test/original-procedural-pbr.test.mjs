import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeOriginalPBR} from '../shared/original-procedural-pbr.mjs';
test('flat heightmap creates upright normals and uniform material channels',()=>{
 const r=synthesizeOriginalPBR({width:4,height:4,heights:new Uint8Array(16).fill(128),roughness:.8,metallic:.2});
 assert.deepEqual([...r.normal.slice(0,4)],[128,128,255,255]);
 assert.deepEqual([...r.orme.slice(0,4)],[255,204,51,0]);
});
test('slope tilts normals and output is deterministic',()=>{
 const h=Uint8Array.from([0,64,128,255,0,64,128,255,0,64,128,255,0,64,128,255]);
 const a=synthesizeOriginalPBR({width:4,height:4,heights:h,wrap:false}),b=synthesizeOriginalPBR({width:4,height:4,heights:h,wrap:false});
 assert.deepEqual(a,b);assert.ok(a.normal[4]<128);assert.equal(a.orme.length,64);
});
test('cavity lowers AO and invalid input is rejected',()=>{
 const h=new Uint8Array(9).fill(255);h[4]=0;
 const r=synthesizeOriginalPBR({width:3,height:3,heights:h});
 assert.ok(r.orme[4*4]<255);
 assert.throws(()=>synthesizeOriginalPBR({width:2,height:2,heights:new Uint8Array(3)}),RangeError);
});
