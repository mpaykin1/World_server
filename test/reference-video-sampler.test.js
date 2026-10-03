'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');

test('video sampler exposes deterministic bounded sample times',async()=>{
  const {sampleTimes}=await import('../shared/reference-graphics/video-sampler.mjs');
  assert.deepEqual(sampleTimes(10,1),[5]);
  const times=sampleTimes(10,5);
  assert.equal(times.length,5);
  assert(times[0]>0&&times[4]<10);
  assert(times.every((v,i)=>i===0||v>times[i-1]));
  assert.equal(sampleTimes(5,100).length,24);
});
