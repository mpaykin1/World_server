import test from 'node:test';
import assert from 'node:assert/strict';
import {meshWorkerRequest,installVoxelMeshWorker} from '../shared/voxel-mesh-worker-adapter.mjs';
test('worker emits transferable typed geometry with deterministic material IDs',()=>{
 const r=meshWorkerRequest({requestId:'chunk:1',size:[1,1,1],origin:[2,3,4],blocks:new Uint16Array([5])});
 assert.equal(r.requestId,'chunk:1');assert.equal(r.faceCount,6);
 assert.deepEqual([...r.materialIds],[5,5,5,5,5,5]);
 assert.equal(r.positions[0],3);
});
test('worker respects neighboring chunk boundary and rejects malformed payload',()=>{
 const r=meshWorkerRequest({requestId:7,size:[1,1,1],origin:[2,3,4],
  blocks:new Uint16Array([5]),neighborBlocks:[[3,3,4,6]]});
 assert.equal(r.faceCount,5);
 assert.throws(()=>meshWorkerRequest({size:[1,1,1],blocks:new Uint16Array([])}),RangeError);
});
test('worker listener transfers buffers and isolates bad requests',()=>{
 let listener;const calls=[];const scope={
  addEventListener:(type,fn)=>{assert.equal(type,'message');listener=fn;},
  postMessage:(message,transfer)=>calls.push({message,transfer})
 };
 installVoxelMeshWorker(scope);
 listener({data:{requestId:1,size:[1,1,1],blocks:new Uint16Array([2])}});
 assert.equal(calls[0].message.faceCount,6);assert.equal(calls[0].transfer.length,5);
 listener({data:{requestId:2,size:[0,1,1],blocks:new Uint16Array([])}});
 assert.equal(calls[1].message.requestId,2);
 assert.match(calls[1].message.error,/size/);
});
