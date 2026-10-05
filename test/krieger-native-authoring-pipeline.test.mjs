import test from "node:test";
import assert from "node:assert/strict";
import {compileKriegerNativeAuthoring} from "../tools/krieger-total-control/native-authoring-compiler.mjs";
import {
  parseKkriegerOplist,buildConventionCatalog,parseKxClassTable
} from "../tools/krieger-total-control/operator-resolver.mjs";
import {
  operatorIdsForPlan,prepareKxAuthoringTarget
} from "../tools/krieger-total-control/native-authoring-kx-pipeline.mjs";

function vs(n){return n<0x80?Buffer.from([n]):Buffer.from([(n&0x7f)|0x80,(n>>7)&0xff]);}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}
function fixture(classes=[]){
  const chunks=[u32(2),u32(0),u32(0),u32(120),u32(64),vs(1),vs(0)];
  for(let i=0;i<16;i++)chunks.push(vs(i===0?0:0));
  for(const c of classes){
    chunks.push(u32(c.convention),u16(c.id),Buffer.from(c.packing+"\0","ascii"));
  }
  chunks.push(u32(0),Buffer.from([0xde,0xad,0xbe,0xef]));
  return Buffer.concat(chunks);
}
const filler=Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n");
const oplist=parseKkriegerOplist(`
0x81, Mesh_Cube, Exec_Misc_Nop,
0x90, Mesh_Bevel, Exec_Misc_Nop,
0xc0, Init_Scene_Scene, Exec_Scene_Scene,
0xc3, Init_Scene_Transform, Exec_Scene_Transform,
${filler}
`);

test("pipeline resolves compiler operator ids to file-local command indices",()=>{
  const recipe={id:"tiny",objects:[{
    id:"box",primitive:"cube",
    modifiers:[{kind:"bevel",params:{amount:.1}}],
    position:[0,0,0],scale:[1,1,1],
  }]};
  const plan=compileKriegerNativeAuthoring(recipe);
  assert.deepEqual(operatorIdsForPlan(plan),[0x81,0x90,0xc0]);

  const target=fixture([
    {id:0x81,convention:0x0600000d,packing:"bbbbggggggfff"},
    {id:0xc0,convention:0x8000010a,packing:"ggggggfffb"},
    {id:0xc3,convention:0x00000109,packing:"ggggggfff"},
  ]);
  const donor=fixture([{id:0x90,convention:0x46000104,packing:"bFFb"}]);
  const catalog=buildConventionCatalog([{name:"donor",bytes:donor}]);
  const sourceCatalog=new Map([[0x90,{
    id:0x90,realId:0x90,convention:0x46000104,packing:"bFFb",
    initHandler:"Mesh_Bevel",execHandler:"Exec_Misc_Nop"
  }]]);
  const before=parseKxClassTable(target);
  const result=prepareKxAuthoringTarget({plan,targetBytes:target,oplist,catalog,sourceCatalog});
  assert.equal(result.plan.targetKx.allNativeNodesResolved,true);
  assert.equal(result.plan.targetKx.binaryTailPreserved,true);
  assert.equal(result.plan.targetKx.addedClasses.length,1);
  assert.equal(result.plan.targetKx.addedClasses[0].operatorId,0x90);
  assert.equal(result.parsedTarget.classes.length,before.classes.length+1);
  assert.ok(result.plan.nodes.filter(n=>Number.isInteger(n.operatorId)).every(n=>Number.isInteger(n.kxCommandIndex)));
  assert.equal(result.bytes.subarray(result.parsedTarget.classTableEnd).toString("hex"),
    target.subarray(before.classTableEnd).toString("hex"));
});

test("runtime bindings remain explicit and are never assigned fake KX command indices",()=>{
  const recipe={
    id:"runtime",
    objects:[{id:"box",primitive:"cube"}],
    weapons:[{id:"gun",slot:0,damage:1}],
  };
  const plan=compileKriegerNativeAuthoring(recipe);
  const runtime=plan.nodes.find(n=>n.runtimeSymbol==="KKriegerGame::FireShot");
  assert.ok(runtime);
  assert.equal(runtime.operatorId,undefined);
});
