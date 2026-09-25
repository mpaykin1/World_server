import test from 'node:test';
import assert from 'node:assert/strict';
import {createVoxelMeshWorkerClient} from '../shared/voxel-mesh-worker-client.mjs';
test('worker client resolves latest revision only',async()=>{
 const listeners={};const sent=[];
 const worker={addEventListener:(name,fn)=>listeners[name]=fn,removeEventListener:(name)=>delete listeners[name],postMessage:msg=>sent.push(msg),terminate(){}};
 const client=createVoxelMeshWorkerClient(worker);
 const first=client.request('chunk',1,{blocks:new Uint16Array([1])});
 const second=client.request('chunk',2,{blocks:new Uint16Array([2])});
 await assert.rejects(first,/superseded/);
 listeners.message({data:{requestId:sent[0].requestId,faceCount:999}});
 listeners.message({data:{requestId:sent[1].requestId,faceCount:6}});
 assert.equal((await second).faceCount,6);
 client.dispose();
});
