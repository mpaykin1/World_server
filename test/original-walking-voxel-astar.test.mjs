import test from 'node:test';import assert from 'node:assert/strict';
import {findOriginalWalkingPath} from '../shared/original-walking-voxel-astar.mjs';
const flat=(x,y,z)=>({solid:y<0});
test('reaches target on flat ground',()=>{const r=findOriginalWalkingPath({start:[0,0,0],goal:[3,0,0],cell:flat});assert.equal(r.reached,true);assert.deepEqual(r.path.at(-1),[3,0,0]);});
test('steps onto one-high ledge and drops after it',()=>{const cell=(x,y,z)=>({solid:y<0||(x===1&&y===0)});const r=findOriginalWalkingPath({start:[0,0,0],goal:[2,0,0],cell,maxNodes:50});assert.equal(r.reached,true);assert.ok(r.path.some(p=>p[0]===1&&p[1]===1));});
test('avoids impassable hazard and returns partial path under a node budget',()=>{const cell=(x,y,z)=>({solid:y<0,hazard:x===1});const r=findOriginalWalkingPath({start:[0,0,0],goal:[4,0,0],cell,maxNodes:30});assert.equal(r.reached,false);assert.ok(r.path.every(p=>p[0]!==1));const partial=findOriginalWalkingPath({start:[0,0,0],goal:[20,0,0],cell:flat,maxNodes:2});assert.equal(partial.partial,true);});
test('rejects invalid height and path coordinates',()=>assert.throws(()=>findOriginalWalkingPath({start:[0,0,0],goal:[1,0,0],cell:flat,height:0}),RangeError));
