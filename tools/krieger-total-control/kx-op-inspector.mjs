#!/usr/bin/env node
import fs from "node:fs";
import {parseKxGraph} from "./kx-graph-codec.mjs";

const file=process.argv[2];
const id=Number(process.argv[3]??"0xf0");
if(!file){console.error("usage: node kx-op-inspector.mjs <file.kx> [operatorId]");process.exit(2);}
const doc=parseKxGraph(fs.readFileSync(file));
const matches=doc.ops.filter(op=>op.realId===id).map(op=>({
  index:op.index,operatorId:"0x"+op.realId.toString(16),
  commandIndex:op.commandIndex,convention:"0x"+op.convention.toString(16),
  packing:op.packing,inputs:op.inputs,links:op.links,
  paramsHex:op.paramsRaw.toString("hex"),
  animHex:op.animRaw.toString("hex"),
}));
console.log(JSON.stringify({count:matches.length,matches},null,2));
