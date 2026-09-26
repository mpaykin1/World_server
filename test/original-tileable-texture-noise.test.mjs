import test from 'node:test';import assert from 'node:assert/strict';
import {originalTileableValueNoise as value,originalTileableFbm as fbm,originalTileableWorley as worley} from '../shared/original-tileable-texture-noise.mjs';
test('value noise tiles in both axes, including negative coordinates',()=>{
 for(let i=0;i<40;i++){const u=(i-17)/13,v=(i*7-20)/17,a=value(u,v,{periodX:3,periodY:7,seed:12});
 assert.ok(Math.abs(a-value(u+1,v,{periodX:3,periodY:7,seed:12}))<1e-12);
 assert.ok(Math.abs(a-value(u,v-1,{periodX:3,periodY:7,seed:12}))<1e-12);}
});
test('anisotropic fBm is deterministic, tileable and seed sensitive',()=>{
 const opts={cellsX:3,cellsY:7,octaves:5,seed:42},a=fbm(.235,.67,opts);
 assert.equal(a,fbm(.235,.67,opts));assert.ok(Math.abs(a-fbm(1.235,-.33,opts))<1e-12);
 assert.notEqual(a,fbm(.235,.67,{...opts,seed:43}));assert.ok(a>=0&&a<=1);
});
test('Worley cell boundaries and nearest distances tile',()=>{
 for(let i=0;i<20;i++){const u=i/13-.5,v=i/17+.25,a=worley(u,v,{cells:6,seed:17});
 const b=worley(u+1,v-1,{cells:6,seed:17});assert.ok(Math.abs(a.f1-b.f1)<1e-12);
 assert.ok(Math.abs(a.edge-b.edge)<1e-12);assert.equal(a.id,b.id);assert.ok(a.f2>=a.f1);}
});
test('invalid noise configuration fails explicitly',()=>{
 assert.throws(()=>value(0,0,{periodX:0}),RangeError);
 assert.throws(()=>fbm(0,0,{octaves:0}),RangeError);
 assert.throws(()=>worley(0,0,{cells:0}),RangeError);
});
