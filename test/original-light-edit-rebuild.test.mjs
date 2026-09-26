import test from 'node:test';import assert from 'node:assert/strict';
import {applyOriginalLightEdit} from '../shared/original-light-edit-rebuild.mjs';
test('placing and removing opaque block updates sky and changed sections',()=>{
 const base={size:[1,3,1],opacity:new Uint8Array(3),emission:new Uint8Array(3)};
 const a=applyOriginalLightEdit(base,{x:0,y:1,z:0,opacity:15,emission:0});
 assert.deepEqual([...a.world.light.sky],[0,0,15]);assert.deepEqual(a.changedSections,[0]);
 const b=applyOriginalLightEdit(a.world,{x:0,y:1,z:0,opacity:0,emission:0});
 assert.deepEqual([...b.world.light.sky],[15,15,15]);
});
test('changing emitter updates neighbors and does not mutate input',()=>{
 const base={size:[3,1,1],opacity:new Uint8Array(3),emission:new Uint8Array(3),skyEnabled:false};
 const a=applyOriginalLightEdit(base,{x:1,y:0,z:0,opacity:0,emission:15});
 assert.deepEqual([...a.world.light.block],[14,15,14]);assert.equal(base.emission[1],0);
 const b=applyOriginalLightEdit(a.world,{x:1,y:0,z:0,opacity:0,emission:0});
 assert.deepEqual([...b.world.light.block],[0,0,0]);
});
