import test from'node:test';
import assert from'node:assert/strict';
import{minimumPackedParamBytes}from'../tools/krieger-total-control/krieger-kx-codec.mjs';
import{inspectKriegerClassTable,parseKriegerKx}from'../tools/krieger-total-control/krieger-kx-layout.mjs';

const compact=v=>v<=127?[v]:[(v&127)|128,v>>7];
const u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
const u16=v=>[v&255,(v>>>8)&255];

function fixture({cube=false,spline=false}={}){
 const classes=cube
  ?[{id:0x81,conv:0x0600000d,pack:'bbbbggggggfff'},{id:0xc1,conv:0x85000000,pack:''}]
  :spline?[{id:0x55,conv:1<<20,pack:''}]:[{id:0xc1,conv:0x85000000,pack:''}];
 const out=[];
 out.push(...u32(0),...u32(0),...u32(120*65536),...u32(32*65536));
 out.push(...compact(1),...compact(0));
 out.push(...compact(0),...Array.from({length:15},()=>compact(1)).flat());
 for(const c of classes)out.push(...u32(c.conv),...u16(c.id),...[...c.pack].map(x=>x.charCodeAt(0)),0);
 out.push(...u32(0));
 out.push(0,...(cube?[]:[0]));
 if(cube)out.push(...new Array(minimumPackedParamBytes('bbbbggggggfff')).fill(0));
 if(spline)out.push(...u16(0));
 out.push(1,0);
 return Uint8Array.from(out);
}

test('parser reads compact class table, roots and packed variable fields',()=>{
 const p=parseKriegerKx(fixture({cube:true}));
 assert.equal(p.nOps,1);assert.equal(p.roots[0],0);assert.equal(p.classes[0].operatorId,0x81);
 assert.equal(p.ops[0].paramSlots.length,13);assert.ok(p.ops[0].paramSlots.every(x=>x.size===1));
 assert.equal(p.trailingBytes,0);
});
test('operator spline references are fixed little-endian u16 like KDoc::Init',()=>{
 const p=parseKriegerKx(fixture({spline:true}));
 assert.equal(p.ops[0].splineRefs[0].value,0);
 assert.equal(p.ops[0].splineRefs[0].end-p.ops[0].splineRefs[0].start,2);
 assert.equal(p.trailingBytes,0);
});
test('class inspection exposes actual file operator IDs',()=>{
 assert.deepEqual(inspectKriegerClassTable(fixture()).map(x=>x.operatorId),[0xc1]);
});
