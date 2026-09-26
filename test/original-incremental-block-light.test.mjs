import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalVoxelLight} from '../shared/original-voxel-flood-light.mjs';
import {updateOriginalBlockLight} from '../shared/original-incremental-block-light.mjs';
test('adding emitter propagates incrementally and matches full recompute',()=>{
 const size=[5,1,1],opacity=new Uint8Array(5),emission=new Uint8Array(5);
 const result=updateOriginalBlockLight({size,opacity,emission,block:new Uint8Array(5)},{x:2,y:0,z:0,newOpacity:0,newEmission:15});
 assert.equal(result.mode,'incremental');
 assert.deepEqual([...result.state.block],[13,14,15,14,13]);
 assert.deepEqual(result.state.block,buildOriginalVoxelLight({...result.state,sky:false}).block);
});
test('removing emitter falls back to full rebuild',()=>{
 const size=[3,1,1],opacity=new Uint8Array(3),emission=new Uint8Array([0,15,0]);
 const block=buildOriginalVoxelLight({size,opacity,emission,sky:false}).block;
 const result=updateOriginalBlockLight({size,opacity,emission,block},{x:1,y:0,z:0,newOpacity:0,newEmission:0});
 assert.equal(result.mode,'rebuild');assert.deepEqual([...result.state.block],[0,0,0]);
});
test('opening opaque wall relights incrementally',()=>{
 const size=[3,1,1],opacity=new Uint8Array([0,15,0]),emission=new Uint8Array([15,0,0]);
 const block=buildOriginalVoxelLight({size,opacity,emission,sky:false}).block;
 const result=updateOriginalBlockLight({size,opacity,emission,block},{x:1,y:0,z:0,newOpacity:0,newEmission:0});
 assert.equal(result.mode,'incremental');assert.deepEqual([...result.state.block],[15,14,13]);
});
