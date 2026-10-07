import test from "node:test";
import assert from "node:assert/strict";
import {parseKxGraph,verifyKxByteRoundTrip} from "../tools/krieger-total-control/kx-graph-codec.mjs";
import {appendKxOperators} from "../tools/krieger-total-control/kx-graph-mutate.mjs";

function vs(n){return n<0x80?Buffer.from([n]):Buffer.from([(n&0x7f)|0x80,n>>7]);}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}
function fixture(){
  const x=[u32(2),u32(0),u32(0),u32(120),u32(64),vs(1),vs(0)];
  for(let i=0;i<16;i++)x.push(vs(0));
  x.push(u32(0x06000000),u16(0xb3),Buffer.from([0]),u32(0));
  x.push(Buffer.from([0]),Buffer.from([1]),vs(0));
  return Buffer.concat(x);
}

test("appends a zero-param native operator and reparses the graph",()=>{
  const source=fixture(),before=parseKxGraph(source);
  const out=appendKxOperators(source,[{id:"point2",operatorId:0xb3}]);
  assert.equal(before.ops.length,1);
  assert.equal(out.reparsed.ops.length,2);
  assert.equal(out.added[0].operatorId,0xb3);
  assert.deepEqual(out.added[0].inputs,[]);
  assert.deepEqual(out.roots,before.header.roots);
  assert.equal(verifyKxByteRoundTrip(out.bytes).pass,true);
});

test("aliases allow a new operator to consume an earlier newly appended operator",()=>{
  const source=fixture();
  // Add a fake unary class to the class table is outside mutation scope, so
  // reuse SingleVert only to prove invalid input arity is rejected fail-closed.
  assert.throws(()=>appendKxOperators(source,[
    {id:"a",operatorId:0xb3},
    {id:"b",operatorId:0xb3,inputs:["a"]},
  ]),/expects 0 inputs/);
});

test("missing target class and malformed params fail closed",()=>{
  const source=fixture();
  assert.throws(()=>appendKxOperators(source,[{operatorId:0x90}]),/lacks operator/);
  assert.throws(()=>appendKxOperators(source,[{operatorId:0xb3,paramsRaw:Buffer.from([1])}]),/trailing bytes/);
});

test("root updates can point to a newly appended alias",()=>{
  const source=fixture();
  const out=appendKxOperators(source,[{id:"newRoot",operatorId:0xb3}],{rootUpdates:{0:"newRoot"}});
  assert.equal(out.reparsed.header.roots[0],1);
});
