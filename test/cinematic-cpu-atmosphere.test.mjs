import test from 'node:test';
import assert from 'node:assert/strict';
import {budgetFor,valueNoise,fBm,paintSky,shouldCullWithHysteresis,fogVisibility}
  from '../apps/ai3d-voxel-city/cinematic-cpu-atmosphere.mjs';

test('CPU sky memory and fog budgets are bounded across device tiers',()=>{
  const low=budgetFor('low'),high=budgetFor('high');
  assert.ok(low.width*low.height<high.width*high.height);
  assert.ok(low.steamCount<high.steamCount);
  assert.ok(high.width*high.height*4<3_000_000);
  assert.deepEqual(budgetFor('unrecognized'),budgetFor('balanced'));
});
test('procedural atmosphere is deterministic, finite and spatially varying',()=>{
  assert.equal(valueNoise(4.25,8.75,21),valueNoise(4.25,8.75,21));
  assert.notEqual(valueNoise(4.25,8.75,21),valueNoise(5.25,9.75,21));
  assert.ok(fBm(4.25,8.75,21,5)>0);
  assert.ok(fBm(4.25,8.75,21,5)<1);
});
test('CPU sky actually paints pixels with atmospheric spatial variation',()=>{
  let pixels=null,strips=0;
  const ctx={
    createImageData:(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)}),
    putImageData:im=>{pixels=im.data;},
    createLinearGradient:()=>({addColorStop(){}}),
    fillRect(){strips++;},set fillStyle(_){}};
  const result=paintSky(ctx,64,64,{seed:19,octaves:2});
  assert.equal(result.width,64);
  assert.equal(pixels.length,64*64*4);
  assert.equal(pixels[3],255);
  assert.ok(pixels.some((p,i)=>i%4===0&&p>8));
  assert.ok(strips>=8);
  assert.throws(()=>paintSky(ctx,5000,5000),/budget/);
});
test('visibility culling has 22m hysteresis, no fast pop at fog boundary',()=>{
  const far=budgetFor('low').far;
  assert.equal(shouldCullWithHysteresis(far+10,true,'low'),true);
  assert.equal(shouldCullWithHysteresis(far+12,true,'low'),false);
  assert.equal(shouldCullWithHysteresis(far-10,false,'low'),false);
  assert.equal(shouldCullWithHysteresis(far-12,false,'low'),true);
  assert.ok(fogVisibility(200,.005)<fogVisibility(50,.005));
  assert.equal(fogVisibility(0,.005),1);
});
