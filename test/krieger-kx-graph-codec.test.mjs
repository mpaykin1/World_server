import test from "node:test";
import assert from "node:assert/strict";
import {parseKxGraph,serializeKxGraph,verifyKxByteRoundTrip} from "../tools/krieger-total-control/kx-graph-codec.mjs";

function vs(n){return n<0x80?Buffer.from([n]):Buffer.from([(n&0x7f)|0x80,(n>>7)&0xff]);}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}

function tiny(){
  const chunks=[u32(2),u32(0),u32(0),u32(120),u32(64),vs(1),vs(0)];
  for(let i=0;i<16;i++)chunks.push(vs(0));
  chunks.push(u32(0x06000000),u16(0xb3),Buffer.from([0]));
  chunks.push(u32(0));
  chunks.push(Buffer.from([0])); // op command 0, zero inputs
  chunks.push(Buffer.from([0x01])); // KA_END
  chunks.push(vs(0)); // event count
  return Buffer.concat(chunks);
}

test("minimal compact KX parses and serializes byte-identically",()=>{
  const source=tiny(),doc=parseKxGraph(source),encoded=serializeKxGraph(doc);
  assert.equal(doc.ops.length,1);
  assert.equal(doc.ops[0].realId,0xb3);
  assert.deepEqual(doc.ops[0].inputs,[]);
  assert.equal(doc.events.length,0);
  assert.equal(doc.splines.length,0);
  assert.deepEqual(encoded,source);
  assert.equal(verifyKxByteRoundTrip(source).pass,true);
});

test("parser rejects operator references to a future or missing node",()=>{
  const source=tiny();
  const doc=parseKxGraph(source);
  const opOffset=doc.sections.operators[0];
  const broken=Buffer.from(source);
  broken[opOffset]=0x80; // shortcut means one input to previous op, impossible for op0
  assert.throws(()=>parseKxGraph(broken),/outside prior graph/);
});

test("serializer preserves opaque trailing bytes",()=>{
  const source=Buffer.concat([tiny(),Buffer.from([0xaa,0xbb,0xcc])]);
  const doc=parseKxGraph(source);
  assert.equal(doc.trailingRaw.toString("hex"),"aabbcc");
  assert.deepEqual(serializeKxGraph(doc),source);
});
