import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOriginalVoxelLight} from '../shared/original-voxel-flood-light.mjs';
test('emission spreads six-way with attenuation and is blocked by opaque cells',()=>{
 const o=new Uint8Array(5),e=new Uint8Array(5);e[0]=15;o[2]=15;
 const a=buildOriginalVoxelLight({size:[5,1,1],opacity:o,emission:e,sky:false});
 assert.deepEqual([...a.block],[15,14,0,0,0]);
 assert.deepEqual([...a.sky],[0,0,0,0,0]);
});
test('full sunlight descends through clear air and opaque roof blocks it',()=>{
 const o=new Uint8Array(3),e=new Uint8Array(3);
 const clear=buildOriginalVoxelLight({size:[1,3,1],opacity:o,emission:e});
 assert.deepEqual([...clear.sky],[15,15,15]);
 o[1]=15;
 const roof=buildOriginalVoxelLight({size:[1,3,1],opacity:o,emission:e});
 assert.deepEqual([...roof.sky],[0,0,15]);
});
test('rejects invalid dimensions and light values',()=>{
 assert.throws(()=>buildOriginalVoxelLight({size:[200,1,1],opacity:new Uint8Array(200),emission:new Uint8Array(200)}),RangeError);
 assert.throws(()=>buildOriginalVoxelLight({size:[1,1,1],opacity:new Uint8Array([16]),emission:new Uint8Array([0])}),RangeError);
});
