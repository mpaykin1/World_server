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

export function findViewportTemplate(bytes,{rootSlot=2}={}){
  const doc=parseKxGraph(bytes);
  const root=doc.header.roots[rootSlot];
  if(!Number.isInteger(root)||root<0||root>=doc.ops.length)
    throw new Error(`root slot ${rootSlot} is not active`);
  const reachable=reachableFrom(doc,root);
  const viewports=[...reachable].map(i=>doc.ops[i]).filter(op=>op.realId===0xf0).sort((a,b)=>b.index-a.index);
  if(!viewports.length)throw new Error(`no reachable Viewport 0xf0 under root slot ${rootSlot}`);
  return{doc,root,template:viewports[0],reachable};
}

export function attachAuthoredSceneToRuntime(bytes,{sceneIndex,rootSlot=2}={}){
  const source=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes);
  const {doc,root:oldRoot,template}=findViewportTemplate(source,{rootSlot});
  if(!Number.isInteger(sceneIndex)||sceneIndex<0||sceneIndex>=doc.ops.length)
    throw new RangeError("authored scene index out of range");
  if(doc.ops[sceneIndex].realId!==0xc0)
    throw new Error(`authored scene index ${sceneIndex} is 0x${doc.ops[sceneIndex].realId.toString(16)}, expected Scene 0xc0`);

  if(!template.inputs.length)throw new Error("reachable Viewport has no Scene input to extend");
  const existingSceneIndex=template.inputs[0];

  const first=appendKxOperators(source,[{
    id:"ws-combined-scene",
    operatorId:0xc1,
    inputs:[existingSceneIndex,sceneIndex],
    paramsRaw:Buffer.alloc(0),
  }]);
  const combinedSceneIndex=first.added[0].index;

  const viewportInputs=[combinedSceneIndex,...template.inputs.slice(1)];
  const second=appendKxOperators(first.bytes,[{
    id:"ws-authored-viewport",
    operatorId:0xf0,
    inputs:viewportInputs,
    links:template.links,
    paramsRaw:template.paramsRaw,
    animRaw:template.animRaw,
    blobRaw:template.blobRaw,
  }]);
  const viewportIndex=second.added[0].index;

  const third=appendKxOperators(second.bytes,[{
    id:"ws-runtime-root",
    operatorId:0x0d,
    inputs:[oldRoot,viewportIndex],
    paramsRaw:Buffer.alloc(0),
  }],{rootUpdates:{[rootSlot]:"ws-runtime-root"}});

  const finalDoc=parseKxGraph(third.bytes);
  const newRoot=finalDoc.header.roots[rootSlot];
  const rootOp=finalDoc.ops[newRoot];
  const combinedScene=finalDoc.ops[combinedSceneIndex];
  const viewport=finalDoc.ops[viewportIndex];
  if(rootOp.realId!==0x0d)throw new Error("new runtime root is not Demo 0x0d");
  if(JSON.stringify(rootOp.inputs)!==JSON.stringify([oldRoot,viewportIndex]))
    throw new Error("new Demo root does not preserve old root + authored viewport");
  if(combinedScene.realId!==0xc1||JSON.stringify(combinedScene.inputs)!==JSON.stringify([existingSceneIndex,sceneIndex]))
    throw new Error("Scene_Add does not combine existing + authored scenes");
  if(viewport.realId!==0xf0||viewport.inputs[0]!==combinedSceneIndex)
    throw new Error("authored viewport is not wired to combined Scene");
  if(!verifyKxByteRoundTrip(third.bytes).pass)throw new Error("runtime-attached KX failed lossless reparse");

  return{
    bytes:third.bytes,
    oldRoot,newRoot,rootSlot,
    existingSceneIndex,sceneIndex,combinedSceneIndex,viewportIndex,
    viewportTemplateIndex:template.index,
    roots:finalDoc.header.roots,
    finalOps:finalDoc.ops.length,
    boundary:{
      authoredGraphReachableFromExistingRoots:true,
      oldRuntimeRootPreservedAsInput:true,
      existingGameScenePreservedInSceneAdd:true,
      clonedExistingViewportContract:true,
      browserRenderProven:false,
    },
  };
}

function latestAuthoredScene(doc){
  for(let i=doc.ops.length-1;i>=0;i--)if(doc.ops[i].realId===0xc0)return i;
  return -1;
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const [inputPath,outputPath,sceneText]=process.argv.slice(2);
  if(!outputPath){
    console.error("usage: node kx-runtime-root-attach.mjs <authored.kx> <out.kx> [sceneIndex]");
    process.exit(2);
  }
  const source=fs.readFileSync(inputPath),doc=parseKxGraph(source);
  const sceneIndex=sceneText==null?latestAuthoredScene(doc):Number(sceneText);
  const out=attachAuthoredSceneToRuntime(source,{sceneIndex});
  fs.writeFileSync(outputPath,out.bytes);
  console.log(JSON.stringify({pass:true,...out,bytes:undefined},null,2));
}
