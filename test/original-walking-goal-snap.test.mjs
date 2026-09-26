import test from 'node:test';import assert from 'node:assert/strict';
import {findOriginalWalkingPath} from '../shared/original-walking-voxel-astar.mjs';
const ground=(x,y,z)=>({solid:y<0});
test('goal in midair snaps downward to the nearest supported walking cell',()=>{
 const r=findOriginalWalkingPath({start:[0,0,0],goal:[3,3,0],cell:ground,maxNodes:100});
 assert.deepEqual(r.resolvedGoal,[3,0,0]);assert.equal(r.reached,true);assert.deepEqual(r.path.at(-1),[3,0,0]);
});
test('goal snapping is limited to four downward checks',()=>{
 const r=findOriginalWalkingPath({start:[0,0,0],goal:[1,20,0],cell:ground,maxNodes:10});
 assert.deepEqual(r.resolvedGoal,[1,16,0]);assert.equal(r.reached,false);
});
test('hazardous floor is not treated as valid support',()=>{
 const cell=(x,y,z)=>({solid:y<0||(x===2&&y===0),hazard:x===2&&y===0});
 const r=findOriginalWalkingPath({start:[0,0,0],goal:[2,1,0],cell,maxNodes:30});
 assert.deepEqual(r.resolvedGoal,[2,0,0]);
});
