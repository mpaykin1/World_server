import test from 'node:test';import assert from 'node:assert/strict';
import {finalizeOriginalMaterial} from '../shared/original-material-finalizer.mjs';
import {synthesizeOriginalStone} from '../shared/original-stone-texture-recipe.mjs';
import {synthesizeOriginalFluid} from '../shared/original-fluid-materials.mjs';
test('flat height produces neutral normal and full AO',()=>{
 const size=4,albedo=new Uint8Array(size*size*4).fill(255),height=new Uint8Array(size*size).fill(128);
 const r=finalizeOriginalMaterial({size,albedo,height});
 for(let i=0;i<size*size;i++){assert.equal(r.normal[i*4],128);assert.equal(r.normal[i*4+1],128);assert.equal(r.normal[i*4+2],255);assert.equal(r.orme[i*4],255);}
});
test('transparent cutout pixels inherit neighbor RGB without changing alpha',()=>{
 const size=4,albedo=new Uint8Array(64),height=new Uint8Array(16).fill(128);
 albedo.set([200,80,40,255],4*(1+4));
 const r=finalizeOriginalMaterial({size,albedo,height,cutout:true});
 assert.deepEqual([...r.albedo.slice(4*(2+4),4*(2+4)+4)],[200,80,40,0]);
});
test('stone and lava materials finalize into correctly packed independent PBR channels',()=>{
 const stone=synthesizeOriginalStone({size:32,seed:5}),lava=synthesizeOriginalFluid({kind:'lava',size:32,seed:7});
 const a=finalizeOriginalMaterial(stone),b=finalizeOriginalMaterial(lava);
 assert.equal(a.normal.length,4096);assert.equal(b.orme.length,4096);
 assert.ok(b.orme.some((v,i)=>i%4===3&&v>100));assert.ok(a.orme.every((v,i)=>i%4!==3||v===0));
});
test('invalid material shapes are rejected',()=>assert.throws(()=>finalizeOriginalMaterial({size:4,albedo:new Uint8Array(3),height:new Uint8Array(16)}),RangeError));
