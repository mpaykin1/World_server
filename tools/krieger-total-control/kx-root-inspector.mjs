#!/usr/bin/env node
import fs from "node:fs";
import {parseKxGraph} from "./kx-graph-codec.mjs";

export function inspectRoots(bytes,{depth=6}={}){
  const doc=parseKxGraph(bytes);
  function walk(index,level,seen){
    if(index==null||index<0||index>=doc.ops.length)return null;
    const op=doc.ops[index];
    const node={
      index,
      operatorId:"0x"+op.realId.toString(16),
      commandIndex:op.commandIndex,
      inputCount:op.inputs.length,
      links:op.links.filter(x=>x!=null),
    };
    if(level>=depth||seen.has(index))return node;
    const next=new Set(seen);next.add(index);
    node.inputs=op.inputs.map(x=>walk(x,level+1,next));
    return node;
  }
  return{
    ops:doc.ops.length,
    classes:doc.header.classes.length,
    roots:doc.header.roots.map((index,slot)=>({
      slot,index,
      operatorId:index<doc.ops.length?"0x"+doc.ops[index].realId.toString(16):null,
      graph:index<doc.ops.length?walk(index,0,new Set()):null,
    })),
  };
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const file=process.argv[2],depth=Number(process.argv[3]??6);
  if(!file){console.error("usage: node kx-root-inspector.mjs <file.kx> [depth]");process.exit(2);}
  console.log(JSON.stringify(inspectRoots(fs.readFileSync(file),{depth}),null,2));
}
