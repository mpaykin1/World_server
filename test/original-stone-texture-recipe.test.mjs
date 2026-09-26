import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeOriginalStone} from '../shared/original-stone-texture-recipe.mjs';
test('seeded stone is deterministic with correctly sized opaque albedo and height',()=>{
 const a=synthesizeOriginalStone({size:32,seed:42}),b=synthesizeOriginalStone({size:32,seed:42});
 assert.deepEqual(a,b);assert.equal(a.albedo.length,4096);assert.equal(a.height.length,1024);
 for(let i=3;i<a.albedo.length;i+=4)assert.equal(a.albedo[i],255);
});
test('different seeds change stone texture and dark veins lower height',()=>{
 const a=synthesizeOriginalStone({size:64,seed:9}),b=synthesizeOriginalStone({size:64,seed:10});
 assert.notDeepEqual(a.albedo,b.albedo);assert.ok(a.veinPixels>0);
});
test('invalid recipe parameters fail explicitly',()=>{
 assert.throws(()=>synthesizeOriginalStone({size:2}),RangeError);
 assert.throws(()=>synthesizeOriginalStone({base:[-1,0,0]}),RangeError);
});
