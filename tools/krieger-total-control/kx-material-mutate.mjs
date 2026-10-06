#!/usr/bin/env node
import fs from "node:fs";
import crypto from "node:crypto";
import {parseKxGraph,serializeKxGraph,verifyKxByteRoundTrip} from "./kx-graph-codec.mjs";

function reachableFrom(doc,rootIndex){
  const seen=new Set(),stack=[rootIndex];
  while(stack.length){
    const i=stack.pop();
    if(!Number.isInteger(i)||i<0||i>=doc.ops.length||seen.has(i))continue;
    seen.add(i);
    const op=doc.ops[i];
    for(const x of op.inputs)stack.push(x);
    for(const x of op.links)if(x!=null)stack.push(x);
  }
  return seen;
}

function nextOffset(buf,o,ch){
  switch(ch.toLowerCase()){
    case "g":{const a=buf[o++];if(a!==0x00&&a!==0x80&&a!==0x01&&a!==0x81)o++;return o;}
    case "f":{const a=buf[o++];if(a!==0x00&&a!==0x01&&a!==0xff)o+=2;return o;}
    case "e":return o+2;
    case "i":case "c":return o+4;
    case "s":return o+2;
    case "b":return o+1;
    case "m":return o+3;
    case "-":return o;
    default:throw new Error(`unknown packing code ${ch}`);
  }
}

function logicalU32Info(op,target){
  let o=0;
  for(let i=0;i<op.packing.length;i++){
    const ch=op.packing[i].toLowerCase();
    if(i===target){
      if(ch!=="i"&&ch!=="c")throw new Error(`logical field ${target} is ${ch}, not u32-compatible`);
      if(o+4>op.paramsRaw.length)throw new Error("material params truncated");
      return{offset:o,value:op.paramsRaw.readUInt32LE(o),packing:ch};
    }
    o=nextOffset(op.paramsRaw,o,ch);
  }
  throw new Error(`logical field ${target} outside packing ${op.packing}`);
}

function brightness(color){
  return ((color&255)+((color>>>8)&255)+((color>>>16)&255))/3;
}
function contrastingColor(color){
  const alpha=color&0xff000000;
  const rgb=brightness(color)>127?0x000000:0x00ffffff;
  return (alpha|rgb)>>>0;
}
function sha(buf){return crypto.createHash("sha256").update(buf).digest("hex");}

export function mutateMaterialAmbient(input,{mode="reachable",rootSlot=2,field=53}={}){
  const source=Buffer.isBuffer(input)?Buffer.from(input):Buffer.from(input);
  const doc=parseKxGraph(source);
  const root=doc.header.roots[rootSlot];
  if(!Number.isInteger(root)||root<0||root>=doc.ops.length)throw new Error("inactive runtime root");
  const reachable=reachableFrom(doc,root);

  const reachableMaterials=[];
  for(const i of reachable){
    const op=doc.ops[i];
    if(op.realId!==0x96||op.links[0]==null)continue;
    const mi=op.links[0],material=doc.ops[mi];
    if(material?.realId!==0xd0)continue;
    const info=logicalU32Info(material,field);
    reachableMaterials.push({index:mi,op:material,...info,brightness:brightness(info.value)});
  }
  if(!reachableMaterials.length)throw new Error("no reachable Material 0xd0 behind Mesh_MatLink");
  reachableMaterials.sort((a,b)=>b.brightness-a.brightness||a.index-b.index);

  let target;
  if(mode==="reachable")target=reachableMaterials[0];
  else if(mode==="unreachable"){
    const candidates=doc.ops
      .map((op,index)=>({op,index}))
      .filter(x=>x.op.realId===0xd0&&!reachable.has(x.index))
      .map(x=>{try{return{x,...logicalU32Info(x.op,field),brightness:brightness(logicalU32Info(x.op,field).value)}}catch{return null}})
      .filter(Boolean)
      .sort((a,b)=>b.brightness-a.brightness||a.index-b.index);
    if(!candidates.length)throw new Error("no unreachable Material 0xd0 negative-control candidate");
    target=candidates[0];
  }else throw new Error("mode must be reachable or unreachable");

  const before=target.value>>>0;
  const after=contrastingColor(before);
  if(after===before)throw new Error("material contrast mutation is a no-op");
  const params=Buffer.from(target.op.paramsRaw);
  params.writeUInt32LE(after,target.offset);
  doc.ops[target.index].paramsRaw=params;
  const bytes=serializeKxGraph(doc);
  if(bytes.equals(source))throw new Error("material mutation did not change KX bytes");
  const roundTrip=verifyKxByteRoundTrip(bytes);
  if(!roundTrip.pass)throw new Error("mutated material KX failed lossless reparse");

  return{
    bytes,
    report:{
      pass:true,mode,rootSlot,materialIndex:target.index,
      targetReachable:reachable.has(target.index),
      logicalField:field,packing:target.packing,
      colorBefore:"0x"+before.toString(16).padStart(8,"0"),
      colorAfter:"0x"+after.toString(16).padStart(8,"0"),
      sourceSha256:sha(source),mutatedSha256:sha(bytes),
      losslessReparse:true,
      boundary:"native KX Material 0xd0 ambient color -> material paramsRaw -> renderer material pass",
    }
  };
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const [inputPath,outputPath,mode,reportPath]=process.argv.slice(2);
  if(!reportPath){
    console.error("usage: node kx-material-mutate.mjs <in.kx> <out.kx> <reachable|unreachable> <report.json>");
    process.exit(2);
  }
  const out=mutateMaterialAmbient(fs.readFileSync(inputPath),{mode});
  fs.writeFileSync(outputPath,out.bytes);
  fs.writeFileSync(reportPath,JSON.stringify(out.report,null,2)+"\n");
  console.log(JSON.stringify(out.report,null,2));
}
