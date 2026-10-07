#!/usr/bin/env node
import fs from "node:fs";
import {parseKxGraph,verifyKxByteRoundTrip} from "./kx-graph-codec.mjs";
import {appendKxOperators} from "./kx-graph-mutate.mjs";

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

function latestAuthoredScene(doc){
  for(let i=doc.ops.length-1;i>=0;i--)if(doc.ops[i].realId===0xc0)return doc.ops[i];
  throw new Error("no authored Scene 0xc0 found");
}

function logicalU32(op,target){
  let o=0;
  for(let i=0;i<op.packing.length;i++){
    const ch=op.packing[i].toLowerCase();
    if(i===target){
      if(ch!=="i"&&ch!=="c")return null;
      if(o+4>op.paramsRaw.length)return null;
      return op.paramsRaw.readUInt32LE(o);
    }
    switch(ch){
      case "g":{
        const a=op.paramsRaw[o++]; if(a!==0x00&&a!==0x80&&a!==0x01&&a!==0x81)o++; break;
      }
      case "f":{
        const a=op.paramsRaw[o++]; if(a!==0x00&&a!==0x01&&a!==0xff)o+=2; break;
      }
      case "e":o+=2;break;
      case "i":case "c":o+=4;break;
      case "s":o+=2;break;
      case "b":o+=1;break;
      case "m":o+=3;break;
      case "-":break;
      default:return null;
    }
  }
  return null;
}

function rgbBrightness(color){
  if(color==null)return -1;
  return ((color&255)+((color>>>8)&255)+((color>>>16)&255))/3;
}

function chooseDonorMatLink(doc,{rootSlot=2}={}){
  const root=doc.header.roots[rootSlot];
  if(!Number.isInteger(root)||root<0||root>=doc.ops.length)throw new Error("inactive runtime root");
  const reachable=reachableFrom(doc,root);
  const links=[...reachable].map(i=>doc.ops[i]).filter(op=>op.realId===0x96&&op.links[0]!=null);
  if(!links.length)throw new Error("no reachable Mesh_MatLink 0x96 with material link");
  const counts=new Map();
  for(const op of links){
    const material=op.links[0];
    counts.set(material,(counts.get(material)??0)+1);
  }
  const ranked=[...counts.entries()].map(([materialIndex,usageCount])=>{
    const material=doc.ops[materialIndex];
    const ambientColor=material?.realId===0xd0?logicalU32(material,53):null;
    return{materialIndex,usageCount,material,ambientColor,ambientBrightness:rgbBrightness(ambientColor)};
  }).sort((a,b)=>b.ambientBrightness-a.ambientBrightness||b.usageCount-a.usageCount||a.materialIndex-b.materialIndex);
  const chosen=ranked[0];
  const donor=links.find(op=>op.links[0]===chosen.materialIndex);
  if(!chosen.material)throw new Error("donor material index missing");
  return{
    donor,materialIndex:chosen.materialIndex,usageCount:chosen.usageCount,
    materialOperatorId:chosen.material.realId,ambientColor:chosen.ambientColor,
    ambientBrightness:chosen.ambientBrightness,
  };
}

export function materializeAuthoredScene(bytes,{rootSlot=2}={}){
  const source=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  const doc=parseKxGraph(source);
  const scene=latestAuthoredScene(doc);
  if(scene.inputs.length!==1)throw new Error("authored Scene must have exactly one mesh input");
  const meshIndex=scene.inputs[0];
  const {donor,materialIndex,usageCount,materialOperatorId,ambientColor,ambientBrightness}=chooseDonorMatLink(doc,{rootSlot});

  const first=appendKxOperators(source,[{
    id:"ws-authored-matlink",
    operatorId:0x96,
    inputs:[meshIndex],
    links:[materialIndex],
    paramsRaw:donor.paramsRaw,
    animRaw:donor.animRaw,
    blobRaw:donor.blobRaw,
  }]);
  const matLinkIndex=first.added[0].index;

  const second=appendKxOperators(first.bytes,[{
    id:"ws-authored-visible-scene",
    operatorId:0xc0,
    inputs:[matLinkIndex],
    links:scene.links,
    paramsRaw:scene.paramsRaw,
    animRaw:scene.animRaw,
    blobRaw:scene.blobRaw,
  }]);
  const sceneIndex=second.added[0].index;
  const finalDoc=parseKxGraph(second.bytes);
  if(finalDoc.ops[matLinkIndex].realId!==0x96)throw new Error("material bridge did not reparse as Mesh_MatLink");
  if(finalDoc.ops[matLinkIndex].links[0]!==materialIndex)throw new Error("material bridge link drift");
  if(finalDoc.ops[sceneIndex].realId!==0xc0||finalDoc.ops[sceneIndex].inputs[0]!==matLinkIndex)
    throw new Error("visible Scene does not consume materialized mesh");
  if(!verifyKxByteRoundTrip(second.bytes).pass)throw new Error("materialized KX failed lossless reparse");

  return{
    bytes:second.bytes,
    sceneIndex,matLinkIndex,meshIndex,
    donorMatLinkIndex:donor.index,materialIndex,materialOperatorId,usageCount,
    ambientColor:ambientColor==null?null:"0x"+ambientColor.toString(16).padStart(8,"0"),
    ambientBrightness,
    boundary:{
      authoredMeshUsesExistingReachableMaterial:true,
      donorMaterialSelectedByBrightReachableAmbient:true,
      visualMaterialBridgeIsNativeKx:true,
    },
  };
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const [inputPath,outputPath]=process.argv.slice(2);
  if(!outputPath){
    console.error("usage: node kx-visual-materialize.mjs <authored.kx> <out.kx>");
    process.exit(2);
  }
  const out=materializeAuthoredScene(fs.readFileSync(inputPath));
  fs.writeFileSync(outputPath,out.bytes);
  console.log(JSON.stringify({pass:true,...out,bytes:undefined},null,2));
}
