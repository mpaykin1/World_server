import test from 'node:test';
import assert from 'node:assert/strict';
import {buildVolcanicRtsLayout}
 from '../apps/ai3d-voxel-city/cinematic-rts-volcanic.mjs';
import {paintRtsLightDecal,layoutRtsLighting,lightingBudget}
 from '../apps/ai3d-voxel-city/cinematic-rts-baked-light.mjs';

test('original CPU contact shadows are anti-aliased and deterministic',()=>{
 const a=paintRtsLightDecal('contact',64),b=paintRtsLightDecal('contact',64);
 assert.deepEqual(a,b);
 assert.equal(a.pixels.length,64*64*4);
 const alpha=(x,y)=>a.pixels[(y*64+x)*4+3];
 assert.ok(alpha(32,32)>alpha(18,20));
 assert.ok(alpha(18,20)>alpha(0,0));
 assert.equal(alpha(0,0),0);
 assert.throws(()=>paintRtsLightDecal('contact',1024),/unsafe/);
 assert.throws(()=>paintRtsLightDecal('unsupported',96),/unsafe/);
});
test('different light fields have original lava/mineral coloration',()=>{
 const lava=paintRtsLightDecal('lava',64).pixels;
 const blue=paintRtsLightDecal('mineral',64).pixels;
 const center=(32*64+32)*4;
 assert.ok(lava[center]>lava[center+1]);
 assert.ok(blue[center+2]>blue[center]);
 assert.ok(lava[center+3]>70);
 assert.ok(blue[center+3]>50);
});
test('volcanic lighting stays on bounded real world positions',()=>{
 const map=buildVolcanicRtsLayout({tier:'balanced'});
 const plan=layoutRtsLighting(map,'balanced');
 assert.equal(plan.contact.length,6);
 assert.ok(plan.banks.length>=8&&plan.banks.length<=24);
 assert.equal(plan.minerals.length,map.resources.length);
 for(const set of [plan.contact,plan.banks,plan.minerals])
  for(const item of set){
   assert.ok(Number.isFinite(item.x)&&Number.isFinite(item.z));
   assert.ok(item.sx>0&&item.sz>0);
  }
 assert.deepEqual(plan,layoutRtsLighting(map,'balanced'));
 assert.throws(()=>layoutRtsLighting({}),/missing/);
});
test('mobile AO/glow raster and instance budgets are physically lower',()=>{
 const map=buildVolcanicRtsLayout({tier:'balanced'});
 const small=layoutRtsLighting(map,'low'),big=layoutRtsLighting(map,'high');
 assert.ok(small.banks.length<big.banks.length);
 assert.ok(small.minerals.length<big.minerals.length);
 const lo=lightingBudget('low'),hi=lightingBudget('high');
 assert.ok(lo.resolution**2<hi.resolution**2);
 assert.ok(lo.bankGlows+lo.crystalHalos<hi.bankGlows+hi.crystalHalos);
});
