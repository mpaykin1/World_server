import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVoxelChunkMesh} from '../shared/voxel-worker-mesh.mjs';
const build=(size,getBlock,origin=[0,0,0])=>buildVoxelChunkMesh({size,getBlock,origin});
test('one opaque voxel produces six outward faces with typed arrays',()=>{
 const m=build([1,1,1],(x,y,z)=>x===0&&y===0&&z===0?7:0);
 assert.equal(m.faceCount,6);
 assert.equal(m.positions.length,72);
 assert.equal(m.indices.length,36);
 assert.deepEqual([...m.materialIds],[7,7,7,7,7,7]);
 for(let f=0;f<6;f++){
   const i=f*12, a=m.positions.slice(i,i+3),b=m.positions.slice(i+3,i+6),c=m.positions.slice(i+6,i+9);
   const u=[b[0]-a[0],b[1]-a[1],b[2]-a[2]],v=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
   const n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
   assert.deepEqual(n.map(value=>value===0?0:value),[...m.normals.slice(i,i+3)].map(value=>value===0?0:value));
 }
});
test('adjacent solid blocks hide interior faces',()=>{
 const m=build([2,1,1],(x,y,z)=>y===0&&z===0&&(x===0||x===1)?1:0);
 assert.equal(m.faceCount,10);
});
test('chunk boundaries sample external neighbors and world origin',()=>{
 const m=build([1,1,1],(x,y,z)=>y===3&&z===4&&(x===2||x===3)?2:0,[2,3,4]);
 assert.equal(m.faceCount,5);
});
test('empty chunks and invalid material values',()=>{
 assert.equal(build([1,1,1],()=>0).faceCount,0);
 assert.throws(()=>build([1,1,1],()=>-1),RangeError);
 assert.throws(()=>build([100,100,100],()=>0),RangeError);
});
