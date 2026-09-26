import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeOriginalWoodEnd} from '../shared/original-wood-end-recipe.mjs';
test('wood end grain has deterministic rings, bark and three correctly sized channels',()=>{
 const a=synthesizeOriginalWoodEnd({size:48,seed:42}),b=synthesizeOriginalWoodEnd({size:48,seed:42});
 assert.deepEqual(a,b);assert.equal(a.albedo.length,48*48*4);assert.equal(a.height.length,48*48);
 assert.equal(a.roughness.length,48*48);assert.ok(a.ringPixels>0);assert.ok(a.barkPixels>0);
});
test('seed variation changes ring contours but preserves opacity and material bounds',()=>{
 const a=synthesizeOriginalWoodEnd({size:64,seed:3}),b=synthesizeOriginalWoodEnd({size:64,seed:4});
 assert.notDeepEqual(a.albedo,b.albedo);
 for(let i=3;i<a.albedo.length;i+=4)assert.equal(a.albedo[i],255);
 assert.ok(a.height.every(n=>n>=0&&n<=255));
});
test('invalid recipe inputs fail',()=>{
 assert.throws(()=>synthesizeOriginalWoodEnd({size:2}),RangeError);
 assert.throws(()=>synthesizeOriginalWoodEnd({rim:1}),RangeError);
});
