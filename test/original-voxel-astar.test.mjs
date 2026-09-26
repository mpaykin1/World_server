import test from 'node:test';import assert from 'node:assert/strict';
import {findOriginalVoxelPath} from '../shared/original-voxel-astar.mjs';
test('detours around solid wall and is deterministic',()=>{
 const options={start:[0,0,0],goal:[3,0,0],bounds:[4,1,3],isWalkable:(x,y,z)=>!(x===1&&z===0)};
 const a=findOriginalVoxelPath(options);assert.ok(a);assert.equal(a.path.length,6);
 assert.deepEqual(a,findOriginalVoxelPath(options));
});
test('rejects unreachable goal and enforces work limit',()=>{
 const o={start:[0,0,0],goal:[2,0,0],bounds:[3,1,1],isWalkable:(x)=>x!==1};
 assert.equal(findOriginalVoxelPath(o),null);
 assert.equal(findOriginalVoxelPath({...o,isWalkable:()=>true,maxVisited:1}),null);
});
