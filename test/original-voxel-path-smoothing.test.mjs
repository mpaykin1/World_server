import test from 'node:test';import assert from 'node:assert/strict';
import {smoothOriginalVoxelPath} from '../shared/original-voxel-path-smoothing.mjs';
test('removes redundant same-level waypoints on open floor',()=>{
 const path=[[0.5,1,0.5],[1.5,1,0.5],[2.5,1,0.5],[3.5,1,0.5]];
 assert.deepEqual(smoothOriginalVoxelPath(path,{canStand:()=>true}),[path[0],path[3]]);
});
test('keeps corner waypoint when footprint intersects obstruction',()=>{
 const path=[[0.5,1,0.5],[0.5,1,2.5],[2.5,1,2.5]];
 const result=smoothOriginalVoxelPath(path,{canStand:(x,y,z)=>!(x===1&&z===1),width:0.6});
 assert.deepEqual(result,path);
});
test('does not smooth across different heights',()=>{
 const path=[[0.5,1,0.5],[1.5,2,0.5],[2.5,2,0.5]];
 assert.deepEqual(smoothOriginalVoxelPath(path,{canStand:()=>true}),path);
});
