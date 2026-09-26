import test from 'node:test';import assert from 'node:assert/strict';
import {buildOriginalSkyLight} from '../shared/original-sky-light.mjs';
const at=(x,y,z,w,d)=>x+w*(z+d*y);
test('open columns retain full skylight down to ground',()=>{
 const r=buildOriginalSkyLight({size:[3,5,3],opacity:new Uint8Array(45)});
 assert.equal(r.sky.every(v=>v===15),true);assert.equal(r.exposure.every(v=>v===0),true);
});
test('opaque roof shades center but side opening contributes attenuated sky',()=>{
 const w=5,h=5,d=5,op=new Uint8Array(w*h*d);
 for(let z=1;z<=3;z++)for(let x=1;x<=3;x++)op[at(x,3,z,w,d)]=15;
 const r=buildOriginalSkyLight({size:[w,h,d],opacity:op});
 assert.equal(r.sky[at(2,3,2,w,d)],0);
 assert.ok(r.sky[at(2,2,2,w,d)]<15);assert.ok(r.sky[at(2,2,2,w,d)]>0);
});
test('partial opacity reduces direct skylight and blocks are dark',()=>{
 const op=new Uint8Array(3);op[2]=2;op[0]=15;
 const r=buildOriginalSkyLight({size:[1,3,1],opacity:op});
 assert.equal(r.sky[2],13);assert.equal(r.sky[1],13);assert.equal(r.sky[0],0);
});
