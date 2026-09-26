import test from 'node:test';
import assert from 'node:assert/strict';
import {snapshotVoxelWorldChunk} from '../shared/voxel-world-chunk-snapshot.mjs';
import {meshWorkerRequest} from '../shared/voxel-mesh-worker-adapter.mjs';
test('existing Y-major chunk storage converts to worker Z-major without mutation',()=>{
 const source=new Uint8Array(2*2*2);
 source[(1*2+0)*2+1]=7; // x=1,y=1,z=0
 const snapshot=snapshotVoxelWorldChunk({cx:2,cz:-1,blocks:source},{chunkSize:2,height:2});
 assert.deepEqual(snapshot.origin,[4,0,-2]);
 assert.equal(snapshot.blocks[(0*2+1)*2+1],7);
 assert.equal(source[(1*2+0)*2+1],7);
 assert.equal(meshWorkerRequest(snapshot).faceCount,6);
});
test('adjacent chunk neighbor suppresses outer boundary face',()=>{
 const source=new Uint8Array(8);source[1]=3; // x=1,y=0,z=0
 const snapshot=snapshotVoxelWorldChunk({cx:0,cz:0,blocks:source},{
  chunkSize:2,height:2,neighborAt:(x,y,z)=>x===2&&y===0&&z===0?3:0
 });
 assert.equal(meshWorkerRequest(snapshot).faceCount,5);
 assert.deepEqual(snapshot.neighborBlocks,[[2,0,0,3]]);
});
test('invalid storage or neighbor values fail closed',()=>{
 assert.throws(()=>snapshotVoxelWorldChunk({cx:0,cz:0,blocks:new Uint8Array(2)},{chunkSize:2,height:2}),RangeError);
 const blocks=new Uint8Array(8);
 assert.throws(()=>snapshotVoxelWorldChunk({cx:0,cz:0,blocks},{chunkSize:2,height:2,neighborAt:()=>-1}),RangeError);
});
