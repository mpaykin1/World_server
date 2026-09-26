import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeOriginalFluid} from '../shared/original-fluid-materials.mjs';
test('water is deterministic and non-emissive with transparent blue albedo',()=>{
 const a=synthesizeOriginalFluid({size:32,seed:13}),b=synthesizeOriginalFluid({size:32,seed:13});
 assert.deepEqual(a,b);assert.equal(a.albedo.length,4096);assert.ok(a.emission.every(v=>v===0));
 assert.ok(a.albedo.every((v,i)=>i%4!==3||v===205));
});
test('lava has emissive hot areas and opaque red-orange albedo',()=>{
 const a=synthesizeOriginalFluid({kind:'lava',size:48,seed:7}),b=synthesizeOriginalFluid({kind:'lava',size:48,seed:8});
 assert.ok(a.emission.some(v=>v>100));assert.ok(a.albedo.every((v,i)=>i%4!==3||v===255));
 assert.notDeepEqual(a.albedo,b.albedo);
});
test('flow alters material texture and invalid arguments are rejected',()=>{
 const still=synthesizeOriginalFluid({kind:'water',size:32,seed:5}),flow=synthesizeOriginalFluid({kind:'water',size:32,seed:5,flow:true});
 assert.notDeepEqual(still.albedo,flow.albedo);
 assert.throws(()=>synthesizeOriginalFluid({kind:'acid'}),RangeError);
 assert.throws(()=>synthesizeOriginalFluid({size:4}),RangeError);
});
