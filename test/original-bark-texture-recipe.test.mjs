import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeOriginalBark} from '../shared/original-bark-texture-recipe.mjs';
test('oak bark is reproducible and has nonuniform ridges',()=>{
 const a=synthesizeOriginalBark({size:32,seed:17}),b=synthesizeOriginalBark({size:32,seed:17});
 assert.deepEqual(a,b);assert.equal(a.albedo.length,4096);assert.equal(a.lenticels,0);
 assert.ok(new Set(a.height).size>10);assert.ok(a.albedo.every((v,i)=>i%4!==3||v===255));
});
test('birch creates horizontal lenticels and differs from oak',()=>{
 const a=synthesizeOriginalBark({size:64,seed:4,kind:'birch'}),b=synthesizeOriginalBark({size:64,seed:4,kind:'oak'});
 assert.ok(a.lenticels>=9);assert.notDeepEqual(a.albedo,b.albedo);
 assert.ok(a.height.includes(51));assert.equal(a.roughness.length,4096);
});
test('rejects invalid size and species',()=>{
 assert.throws(()=>synthesizeOriginalBark({size:8}),RangeError);
 assert.throws(()=>synthesizeOriginalBark({kind:'unknown'}),RangeError);
});
