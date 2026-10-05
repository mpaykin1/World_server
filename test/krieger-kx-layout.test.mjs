
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  appendKriegerOperator,
  inspectKriegerClassTable,
  minimumPackedParamBytes,
  parseKriegerKx,
} from '../tools/krieger-total-control/krieger-kx.mjs';

const compact=v=>v<=127?[v]:[(v&127)|128,v>>7];
const u32=v=>[v&255,(v>>>8)&255,(v>>>16)&255,(v>>>24)&255];
const u16=v=>[v&255,(v>>>8)&255];

function fixture({cube=false}={}){
  const classes=cube
    ? [{id:0x81,conv:0x0600000d,pack:'bbbbggggggfff'},{id:0xc1,conv:0x85000000,pack:''}]
    : [{id:0xc1,conv:0x85000000,pack:''}];
  const out=[];
  out.push(...u32(0),...u32(0),...u32(120*65536),...u32(32*65536));
  out.push(...compact(1),...compact(0));
  out.push(...compact(0),...Array.from({length:15},()=>compact(1)).flat());
  for(const c of classes){
    out.push(...u32(c.conv),...u16(c.id),...[...c.pack].map(x=>x.charCodeAt(0)),0);
  }
  out.push(...u32(0));
  out.push(cube?0:0, ...(cube?[]:[0]));
  if(cube) out.push(...new Array(minimumPackedParamBytes('bbbbggggggfff')).fill(0));
  out.push(1);
  out.push(0);
  return Uint8Array.from(out);
}

test('compact KX parser understands class table, roots and variable packed fields',()=>{
  const bytes=fixture({cube:true});
  const p=parseKriegerKx(bytes);
  assert.equal(p.nOps,1);
  assert.equal(p.roots[0],0);
  assert.equal(p.classes[0].operatorId,0x81);
  assert.equal(p.ops[0].paramSlots.length,13);
  assert.ok(p.ops[0].paramSlots.every(x=>x.size===1));
  assert.equal(p.trailingBytes,0);
});

test('native append adds a real class-table operator and can make it root',()=>{
  const bytes=fixture();
  const out=appendKriegerOperator(bytes,{operatorId:0xc1,inputs:[0],makeRootSlots:[0]});
  assert.equal(out.parsed.nOps,2);
  assert.equal(out.parsed.roots[0],1);
  assert.equal(out.added.operatorId,0xc1);
  assert.deepEqual(out.added.inputs,[0]);
  assert.equal(out.parsed.trailingBytes,0);
  assert.ok(out.bytes.length>bytes.length);
});

test('append fails closed if target class is absent',()=>{
  assert.throws(()=>appendKriegerOperator(fixture(),{operatorId:0x81}),/absent/);
});

test('class inspection exposes real file class ids rather than source-symbol guesses',()=>{
  assert.deepEqual(inspectKriegerClassTable(fixture()).map(x=>x.operatorId),[0xc1]);
});
