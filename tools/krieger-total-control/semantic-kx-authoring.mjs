#!/usr/bin/env node
import fs from "node:fs";
import {prepareRecipeForTarget,loadPinnedResolverEvidence} from "./native-authoring-kx-pipeline.mjs";
import {appendKxOperators} from "./kx-graph-mutate.mjs";
import {inspectOperatorParamsRaw,parseKxGraph} from "./kx-graph-codec.mjs";

function floatBits(value){
  const b=Buffer.alloc(4);b.writeFloatLE(Number(value),0);return b.readUInt32LE(0);
}
function finite(value,label){
  const n=Number(value);if(!Number.isFinite(n))throw new TypeError(`${label} must be finite`);return n;
}
function clampInt(n,min,max){return Math.max(min,Math.min(max,Math.trunc(n)));}

export function encodeF16(value){
  const v=finite(value,"F16");
  const bits=floatBits(v);
  const esrc=((bits>>>23)&255)-128;
  const edst=Math.max(-16,Math.min(15,esrc));
  if(edst===-16)return Buffer.from([0x00]);
  if(Math.abs(v-1.0)<1/1024)return Buffer.from([0x80]);
  if(Math.abs(v-0.5)<0.5/1024)return Buffer.from([0x01]);
  if(Math.abs(v-0.25)<0.25/1024)return Buffer.from([0x81]);
  let mant=bits>>>13;
  const shift=edst-esrc;
  if(shift>0)mant=(mant<<shift)>>>0;
  else if(shift<0)mant=mant>>>(-shift);
  const dest=(((bits>>>16)&0x8000)|((edst+16)<<10)|(mant&1023))>>>0;
  return Buffer.from([(dest>>>8)&255,dest&255]);
}

export function encodeF24(value){
  const v=finite(value,"F24");
  if(Object.is(v,0)||v===0)return Buffer.from([0x00]);
  if(v===1)return Buffer.from([0x01]);
  if(v===-1)return Buffer.from([0xff]);
  const bits=floatBits(v),exp=(bits>>>23)&255;
  if(exp<=1)return Buffer.from([0x00]);
  if(exp===255)throw new RangeError("F24 cannot encode NaN/Infinity");
  return Buffer.from([
    exp&255,
    (bits>>>8)&255,
    ((bits>>>24)&128)|((bits>>>16)&127),
  ]);
}

export function encodeX16(value){
  const n=clampInt(finite(value,"X16")*4096,-32768,32767);
  const b=Buffer.alloc(2);b.writeInt16LE(n,0);return b;
}
function encodeI32(value){
  const n=Math.trunc(finite(value,"i32"));
  if(n<-2147483648||n>2147483647)throw new RangeError("i32 out of range");
  const b=Buffer.alloc(4);b.writeInt32LE(n,0);return b;
}
function encodeI16(value){
  const n=Math.trunc(finite(value,"i16"));
  if(n<-32768||n>32767)throw new RangeError("i16 out of range");
  const b=Buffer.alloc(2);b.writeInt16LE(n,0);return b;
}
function encodeU8(value){
  const n=Math.trunc(finite(value,"u8"));
  if(n<0||n>255)throw new RangeError("u8 out of range");
  return Buffer.from([n]);
}
function encodeU32(value){
  const n=Number(value);
  if(!Number.isInteger(n)||n<0||n>0xffffffff)throw new RangeError("u32 out of range");
  const b=Buffer.alloc(4);b.writeUInt32LE(n>>>0,0);return b;
}
function encodeU24(value){
  const n=Number(value);
  if(!Number.isInteger(n)||n<0||n>0xffffff)throw new RangeError("u24 out of range");
  return Buffer.from([n&255,(n>>>8)&255,(n>>>16)&255]);
}

export function encodePackedValues(packing,values){
  if(typeof packing!=="string")throw new TypeError("packing must be a string");
  if(!Array.isArray(values)||values.length!==packing.length)
    throw new Error(`packing ${packing} expects ${packing.length} logical values, got ${values?.length}`);
  const chunks=[];
  for(let i=0;i<packing.length;i++){
    const ch=packing[i].toLowerCase(),v=values[i];
    switch(ch){
      case "g":chunks.push(encodeF16(v));break;
      case "f":chunks.push(encodeF24(v));break;
      case "e":chunks.push(encodeX16(v));break;
      case "i":chunks.push(encodeI32(v));break;
      case "s":chunks.push(encodeI16(v));break;
      case "b":chunks.push(encodeU8(v));break;
      case "c":chunks.push(encodeU32(v));break;
      case "m":chunks.push(encodeU24(v));break;
      case "-":break;
      default:throw new Error(`unsupported packing code ${packing[i]}`);
    }
  }
  return Buffer.concat(chunks);
}

function vec3(value,fallback,label){
  if(value==null)return [...fallback];
  if(!Array.isArray(value)||value.length!==3)throw new TypeError(`${label} must be vec3`);
  return value.map((x,i)=>finite(x,`${label}[${i}]`));
}
function triplet(value,fallback,label){
  if(value==null)return [...fallback];
  if(Number.isFinite(Number(value)))return [Number(value),Number(value),Number(value)];
  return vec3(value,fallback,label);
}
function exactLength(node,values){
  if(values.length!==node.kxPacking.length)
    throw new Error(`${node.handler} semantic schema produced ${values.length} values for packing ${node.kxPacking}`);
  const raw=encodePackedValues(node.kxPacking,values);
  inspectOperatorParamsRaw(raw,{convention:node.kxConvention,packing:node.kxPacking});
  return raw;
}

const PACKERS=new Map([
  [0xb3,node=>exactLength(node,[])],
  [0x81,node=>{
    const p=node.params?.params??{};
    const tess=triplet(p.tessellate,[1,1,1],"cube.tessellate");
    const localScale=vec3(p.scale,[1,1,1],"cube.scale");
    const localRotation=vec3(p.rotation,[0,0,0],"cube.rotation");
    const localTranslation=vec3(p.translation,[0,0,0],"cube.translation");
    return exactLength(node,[...tess,Number(p.flags??0),...localScale,...localRotation,...localTranslation]);
  }],
  [0x82,node=>{
    const p=node.params?.params??{};
    return exactLength(node,[
      Number(p.facets??8),Number(p.slices??1),Number(p.flags??0),
      Number(p.rings??1),Number(p.arc??0),
    ]);
  }],
  [0x87,node=>{
    const p=node.params?.params??{};
    return exactLength(node,[Number(p.select??0),Number(p.alpha??1),Number(p.count??0)]);
  }],
  [0x8a,node=>{
    const p=node.params?.params??{};
    return exactLength(node,[Number(p.select??1),Number(p.what??0),Number(p.type??0)]);
  }],
  [0x8c,node=>{
    const p=node.params?.params??{};
    return exactLength(node,[Number(p.select??0),Number(p.threshold??4),Number(p.tessellation??0)]);
  }],
  [0x90,node=>{
    const p=node.params?.params??{};
    const amount=p.amount==null?null:Number(p.amount);
    return exactLength(node,[
      Number(p.select??0),
      Number(p.elevation??amount??0.05),
      Number(p.pull??amount??0.05),
      Number(p.mode??0),
    ]);
  }],
  [0x9d,node=>{
    const p=node.params?.params??{};
    return exactLength(node,[Number(p.x??8),Number(p.y??8),Number(p.flags??0)]);
  }],
  [0xa6,node=>{
    const p=node.params?.params??{};
    return exactLength(node,[Number(p.select??0),Number(p.mode??0)]);
  }],
  [0xc0,node=>{
    const p=node.params??{};
    return exactLength(node,[
      ...vec3(p.scale,[1,1,1],"scene.scale"),
      ...vec3(p.rotation,[0,0,0],"scene.rotation"),
      ...vec3(p.position,[0,0,0],"scene.position"),
      Number(p.flags??0),
    ]);
  }],
]);

export function packAuthoringNode(node){
  if(node.kxBinding!=="document-operator")throw new Error(`${node.id} is not a document operator`);
  const pack=PACKERS.get(node.operatorId);
  if(!pack)throw new Error(`semantic packing not implemented for 0x${node.operatorId.toString(16)} ${node.handler}`);
  return pack(node);
}

function buildIncoming(plan){
  const incoming=new Map(plan.nodes.map(n=>[n.id,[]]));
  for(const edge of plan.edges){
    if(!incoming.has(edge.to))continue;
    incoming.get(edge.to).push(edge);
  }
  return incoming;
}

export function planToMutationSpecs(plan){
  const incoming=buildIncoming(plan);
  const native=new Set(plan.nodes.filter(n=>n.kxBinding==="document-operator").map(n=>n.id));
  const specs=[];
  for(const node of plan.nodes){
    if(node.kxBinding!=="document-operator")continue;
    const edges=incoming.get(node.id)??[];
    const inputEdges=edges.filter(e=>e.port==="input"||e.port==="mesh-input");
    const linkEdges=edges.filter(e=>e.port==="material-link");
    const unsupported=edges.filter(e=>!["input","mesh-input","material-link"].includes(e.port));
    if(unsupported.length)throw new Error(`unsupported KX edge ports for ${node.id}: ${unsupported.map(x=>x.port).join(",")}`);
    for(const e of [...inputEdges,...linkEdges])
      if(!native.has(e.from))throw new Error(`native node ${node.id} depends on non-document node ${e.from}`);
    specs.push({
      id:node.id,
      operatorId:node.operatorId,
      inputs:inputEdges.map(e=>e.from),
      links:linkEdges.map(e=>e.from),
      paramsRaw:packAuthoringNode(node),
    });
  }
  return specs;
}

export function emitSemanticKx({preparedBytes,preparedPlan}){
  const specs=planToMutationSpecs(preparedPlan);
  const mutation=appendKxOperators(preparedBytes,specs);
  const emittedPlan={
    ...preparedPlan,
    boundary:{
      ...preparedPlan.boundary,
      emitsNewOperatorInstances:true,
      emitsNativeKxBinary:true,
      authoredGraphReachableFromExistingRoots:false,
    },
    emittedKx:{
      appendedOperators:mutation.added,
      originalOps:mutation.originalCount,
      finalOps:mutation.reparsed.ops.length,
      rootsUnchanged:true,
      losslessReparse:true,
    },
  };
  return{...mutation,plan:emittedPlan,specs};
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const [recipePath,upstreamRoot,targetPath,outKx,outPlan]=process.argv.slice(2);
  if(!outPlan){
    console.error("usage: node semantic-kx-authoring.mjs <recipe.json> <werkkzeug3_kkrieger-root> <target.kx> <out.kx> <out-plan.json>");
    process.exit(2);
  }
  const recipe=JSON.parse(fs.readFileSync(recipePath,"utf8"));
  const evidence=loadPinnedResolverEvidence(upstreamRoot);
  const prepared=prepareRecipeForTarget({
    recipe,targetBytes:fs.readFileSync(targetPath),
    oplist:evidence.oplist,catalog:evidence.catalog,sourceCatalog:evidence.sourceCatalog,
  });
  const emitted=emitSemanticKx({preparedBytes:prepared.bytes,preparedPlan:prepared.plan});
  fs.writeFileSync(outKx,emitted.bytes);
  fs.writeFileSync(outPlan,JSON.stringify(emitted.plan,null,2)+"\n");
  const graph=parseKxGraph(emitted.bytes);
  console.log(JSON.stringify({
    pass:true,
    originalOps:emitted.originalCount,
    finalOps:graph.ops.length,
    added:emitted.added,
    boundary:emitted.plan.boundary,
  },null,2));
}
