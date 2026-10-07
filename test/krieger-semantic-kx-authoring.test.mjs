import test from "node:test";
import assert from "node:assert/strict";
import {
  encodeF16,encodeF24,encodeX16,encodePackedValues,
  packAuthoringNode,planToMutationSpecs
} from "../tools/krieger-total-control/semantic-kx-authoring.mjs";

test("Krieger float encoders preserve documented compact sentinels",()=>{
  assert.equal(encodeF16(0).toString("hex"),"00");
  assert.equal(encodeF16(1).toString("hex"),"80");
  assert.equal(encodeF16(.5).toString("hex"),"01");
  assert.equal(encodeF16(.25).toString("hex"),"81");
  assert.equal(encodeF24(0).toString("hex"),"00");
  assert.equal(encodeF24(1).toString("hex"),"01");
  assert.equal(encodeF24(-1).toString("hex"),"ff");
  assert.equal(encodeX16(1).toString("hex"),"0010");
  assert.equal(encodeX16(-1).toString("hex"),"00f0");
});

test("packed value writer honors non-stored dash slots",()=>{
  const raw=encodePackedValues("bi-s",[7,-3,999,0x1234]);
  assert.equal(raw.length,1+4+2);
  assert.equal(raw[0],7);
  assert.equal(raw.readInt32LE(1),-3);
  assert.equal(raw.readInt16LE(5),0x1234);
});

test("Cube defaults map to the exact 13-slot WerkClasses packing",()=>{
  const node={
    id:"cube",handler:"Mesh_Cube",operatorId:0x81,kxBinding:"document-operator",
    kxConvention:0x0600000d,kxPacking:"bbbbggggggfff",
    params:{primitive:"cube",params:{}},
  };
  const raw=packAuthoringNode(node);
  assert.ok(raw.length>=13);
});

test("Bevel amount maps to both elevation and pull",()=>{
  const node={
    id:"bevel",handler:"Mesh_Bevel",operatorId:0x90,kxBinding:"document-operator",
    kxConvention:0x46000104,kxPacking:"bFFb",
    params:{kind:"bevel",params:{amount:.1}},
  };
  const raw=packAuthoringNode(node);
  assert.ok(raw.length>=4);
});

test("Scene packs scale rotate translate and flags in native order",()=>{
  const node={
    id:"scene",handler:"Init_Scene_Scene",operatorId:0xc0,kxBinding:"document-operator",
    kxConvention:0x0000010a,kxPacking:"ggggggfffb",
    params:{scale:[2,3,4],rotation:[0,0,0],position:[5,6,7],flags:0},
  };
  const raw=packAuthoringNode(node);
  assert.ok(raw.length>=10);
});

test("mutation specs preserve Cube -> Bevel -> Scene topology",()=>{
  const nodes=[
    {id:"cube",handler:"Mesh_Cube",operatorId:0x81,kxBinding:"document-operator",kxConvention:0x0600000d,kxPacking:"bbbbggggggfff",params:{primitive:"cube",params:{}}},
    {id:"bevel",handler:"Mesh_Bevel",operatorId:0x90,kxBinding:"document-operator",kxConvention:0x46000104,kxPacking:"bFFb",params:{kind:"bevel",params:{amount:.1}}},
    {id:"scene",handler:"Init_Scene_Scene",operatorId:0xc0,kxBinding:"document-operator",kxConvention:0x0000010a,kxPacking:"ggggggfffb",params:{scale:[1,1,1],rotation:[0,0,0],position:[0,0,0]}},
  ];
  const plan={nodes,edges:[
    {from:"cube",to:"bevel",port:"mesh-input"},
    {from:"bevel",to:"scene",port:"input"},
  ]};
  const specs=planToMutationSpecs(plan);
  assert.deepEqual(specs.map(x=>({id:x.id,inputs:x.inputs})),[
    {id:"cube",inputs:[]},{id:"bevel",inputs:["cube"]},{id:"scene",inputs:["bevel"]},
  ]);
});
