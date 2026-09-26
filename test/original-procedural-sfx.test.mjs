import test from 'node:test';import assert from 'node:assert/strict';
import {synthesizeOriginalEffect} from '../shared/original-procedural-sfx.mjs';
test('deterministic WAV with correct PCM header',()=>{
 const a=synthesizeOriginalEffect({kind:'impact',seed:42,duration:0.1}),b=synthesizeOriginalEffect({kind:'impact',seed:42,duration:0.1});
 assert.deepEqual(a,b);assert.equal(String.fromCharCode(...a.slice(0,4)),'RIFF');
 const v=new DataView(a.buffer);assert.equal(v.getUint32(24,true),22050);assert.equal(v.getUint32(40,true),a.length-44);
});
test('different seeds yield different sounds',()=>{
 const a=synthesizeOriginalEffect({kind:'wind',seed:1,duration:0.1}),b=synthesizeOriginalEffect({kind:'wind',seed:2,duration:0.1});
 assert.notDeepEqual(a,b);
});
test('rejects invalid synthesis parameters',()=>{
 assert.throws(()=>synthesizeOriginalEffect({kind:'unknown'}),RangeError);
});
