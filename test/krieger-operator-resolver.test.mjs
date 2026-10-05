import test from "node:test";
import assert from "node:assert/strict";
import {
  parseKkriegerOplist,parseKxClassTable,parseWerkClassMetadata,buildConventionCatalog,resolveOperatorIds
} from "../tools/krieger-total-control/operator-resolver.mjs";

function varShort(n){
  if(n<0x80)return Buffer.from([n]);
  return Buffer.from([(n&0x7f)|0x80,(n>>7)&0xff]);
}
function u32(n){const b=Buffer.alloc(4);b.writeUInt32LE(n);return b;}
function u16(n){const b=Buffer.alloc(2);b.writeUInt16LE(n);return b;}
function fixture({old=false,classes=[]}={}){
  const chunks=[];
  if(!old)chunks.push(u32(2));
  const songSize=old?8:0;
  chunks.push(u32(songSize));
  if(songSize)chunks.push(Buffer.alloc(songSize));
  chunks.push(u32(0)); // sample size
  chunks.push(u32(120),u32(64),varShort(3),varShort(0));
  for(let i=0;i<16;i++)chunks.push(varShort(i===0?2:0));
  for(const c of classes){
    chunks.push(u32(c.convention));
    chunks.push(old?Buffer.from([c.id]):u16(c.id));
    chunks.push(Buffer.from(c.packing+"\0","ascii"));
  }
  chunks.push(u32(0));
  return Buffer.concat(chunks);
}
const source=`
KHandler KHandlers[] = {
  0x81, Mesh_Cube, Exec_Misc_Nop,
  0x90, Mesh_Bevel, Exec_Misc_Nop,
  0xc0, Init_Scene_Scene, Exec_Scene_Scene,
  0,0,0,
};`;

test("operator list resolves stable real ids and handlers",()=>{
  const t=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  assert.equal(t.byId.get(0x81).initHandler,"Mesh_Cube");
  assert.equal(t.byHandler.get("Init_Scene_Scene").id,0xc0);
});

test("class parser supports modern u16 ids and compact short counts",()=>{
  const b=fixture({classes:[
    {id:0x81,convention:0x00000102,packing:"ff"},
    {id:0xc0,convention:0x00801100,packing:""},
  ]});
  const p=parseKxClassTable(b);
  assert.equal(p.oldLayout,false);
  assert.equal(p.nOps,3);
  assert.equal(p.classes[0].realId,0x81);
  assert.equal(p.classes[0].packing,"ff");
  assert.equal(p.classes[1].commandIndex,1);
});

test("class parser supports old one-byte class-id exports",()=>{
  const b=fixture({old:true,classes:[{id:0x90,convention:0x10203040,packing:"b"}]});
  const p=parseKxClassTable(b);
  assert.equal(p.oldLayout,true);
  assert.equal(p.flags,2);
  assert.equal(p.classes[0].realId,0x90);
});

test("resolver uses target-local command index when class already exists",()=>{
  const op=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  const target=fixture({classes:[{id:0x81,convention:0x101,packing:"b"}]});
  const catalog=buildConventionCatalog([{name:"a.kx",bytes:target}]);
  const r=resolveOperatorIds({target,oplist:op,catalog,operatorIds:[0x81]});
  assert.equal(r.pass,true);
  assert.equal(r.resolved[0].commandIndex,0);
  assert.equal(r.resolved[0].mode,"target-class");
});

test("resolver can extend target class table only from one unambiguous measured convention",()=>{
  const op=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  const target=fixture({classes:[{id:0x81,convention:0x101,packing:"b"}]});
  const donor=fixture({classes:[{id:0x90,convention:0x202,packing:"fg"}]});
  const catalog=buildConventionCatalog([{name:"target.kx",bytes:target},{name:"donor.kx",bytes:donor}]);
  const r=resolveOperatorIds({target,oplist:op,catalog,operatorIds:[0x90]});
  assert.equal(r.pass,true);
  assert.equal(r.resolved[0].commandIndex,null);
  assert.equal(r.resolved[0].mode,"class-extension-measured");
  assert.equal(r.resolved[0].packing,"fg");
});

test("resolver fails closed on convention ambiguity",()=>{
  const op=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  const target=fixture({classes:[{id:0x81,convention:0x101,packing:"b"}]});
  const a=fixture({classes:[{id:0x90,convention:0x202,packing:"f"}]});
  const b=fixture({classes:[{id:0x90,convention:0x303,packing:"g"}]});
  const catalog=buildConventionCatalog([{name:"a",bytes:a},{name:"b",bytes:b}]);
  const r=resolveOperatorIds({target,oplist:op,catalog,operatorIds:[0x90]});
  assert.equal(r.pass,false);
  assert.equal(r.ambiguous.length,1);
});


test("WerkClasses metadata supplies exact convention and packing for unused native operators",()=>{
  const source=`
WerkClass WerkClasses[] = {
  {
    "Bevel",0x90,KC_MESH,1,1,0x46000104,COL_XTR,0,
    "bFFb",
    Edit_Mesh_Bevel,
    Mesh_Bevel,
    Exec_Misc_Nop,
    { KC_MESH },
    { 0 },
  },
${Array.from({length:90},(_,i)=>`  {"X${i}",0x${(0x200+i).toString(16)},KC_ANY,0,0,0x06000000,COL_NEW,0,"",E,H,X,{0},{0}},`).join("\n")}
};`;
  const m=parseWerkClassMetadata(source);
  assert.equal(m.get(0x90).convention,0x46000104);
  assert.equal(m.get(0x90).packing,"bFFb");
});

test("resolver uses pinned editor metadata when no donor document contains the class",()=>{
  const op=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  const target=fixture({classes:[{id:0x81,convention:0x101,packing:"b"}]});
  const catalog=buildConventionCatalog([{name:"target.kx",bytes:target}]);
  const editorMetadata=new Map([[0x90,{realId:0x90,convention:0x46000104,packing:"bFFb",source:"werkops.cpp"}]]);
  const r=resolveOperatorIds({target,oplist:op,catalog,editorMetadata,operatorIds:[0x90]});
  assert.equal(r.pass,true);
  assert.equal(r.resolved[0].mode,"class-extension-editor-metadata");
  assert.equal(r.resolved[0].convention,0x46000104);
  assert.equal(r.resolved[0].packing,"bFFb");
});

test("resolver fails closed if measured donor metadata conflicts with editor metadata",()=>{
  const op=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  const target=fixture({classes:[{id:0x81,convention:0x101,packing:"b"}]});
  const donor=fixture({classes:[{id:0x90,convention:0x202,packing:"fg"}]});
  const catalog=buildConventionCatalog([{name:"donor",bytes:donor}]);
  const editorMetadata=new Map([[0x90,{realId:0x90,convention:0x46000104,packing:"bFFb",source:"werkops.cpp"}]]);
  const r=resolveOperatorIds({target,oplist:op,catalog,editorMetadata,operatorIds:[0x90]});
  assert.equal(r.pass,false);
  assert.equal(r.ambiguous.length,1);
});


test("source WerkClasses registry supplies convention when no donor .kx uses an operator",()=>{
  const filler=Array.from({length:105},(_,i)=>`
  {
    "F${i}",0x${(0x200+i).toString(16)},KC_MESH,0,0,0x00000000,COL_ADD,0,
    "",
    Edit_F${i},
    Init_F${i},
    Exec_F${i},
    { 0 },
    { 0 },
  },`).join("");
  const registry=parseWerkClassRegistry(`
  {
    "Bevel",0x90,KC_MESH,1,1,0x46000104,COL_XTR,0,
    "bFFb",
    Edit_Mesh_Bevel,
    Mesh_Bevel,
    Exec_Misc_Nop,
    { KC_MESH },
    { 0 },
  },
  ${filler}
  `);
  assert.equal(registry.get(0x90).convention,0x46000104);
  assert.equal(registry.get(0x90).packing,"bFFb");

  const op=parseKkriegerOplist(source+"\n"+Array.from({length:60},(_,i)=>`0x${(0x100+i).toString(16)}, H${i}, E${i},`).join("\n"));
  const target=fixture({classes:[{id:0x81,convention:0x101,packing:"b"}]});
  const catalog=buildConventionCatalog([{name:"target.kx",bytes:target}]);
  const r=resolveOperatorIds({target,oplist:op,catalog,sourceCatalog:registry,operatorIds:[0x90]});
  assert.equal(r.pass,true);
  assert.equal(r.resolved[0].mode,"class-extension-source");
  assert.equal(r.resolved[0].convention,0x46000104);
});
