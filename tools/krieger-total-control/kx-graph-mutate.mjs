#!/usr/bin/env node
import fs from "node:fs";
import {
  parseKxGraph,serializeKxGraph,inspectOperatorParamsRaw,verifyKxByteRoundTrip
} from "./kx-graph-codec.mjs";

const OPC_FLEXINPUT=0x80000000;
function getInputCount(c){return(c&0x00000f00)>>>8;}
function getLinkCount(c){return(c&0x0000f000)>>>12;}
function align4(n){return(n+3)&~3;}

function writeShort(v){
  if(!Number.isInteger(v)||v<0||v>32767)throw new RangeError(`short out of range: ${v}`);
  return v<128?Buffer.from([v]):Buffer.from([(v&127)|128,v>>>7]);
}
function readU32(buf,o,label){
  if(o+4>buf.length)throw new RangeError(`truncated ${label}`);
  return buf.readUInt32LE(o);
}
function headerCountOffset(headerRaw,header){
  let o=0,flags=2;
  if(!header.oldLayout){flags=readU32(headerRaw,o,"flags");o+=4;}
  if(flags&1)o+=32;
  const song=readU32(headerRaw,o,"song size");o+=4+align4(song);
  if(flags&2){const sample=readU32(headerRaw,o,"sample size");o+=4+align4(sample);}
  o+=8; // BPM + song length
  return o;
}
function skipShort(buf,st){
  if(st.o>=buf.length)throw new RangeError("truncated short");
  const a=buf[st.o++];if(a&0x80)st.o++;
}
function rewriteHeader(doc,nOps,roots){
  const raw=doc.headerRaw,start=headerCountOffset(raw,doc.header),st={o:start};
  skipShort(raw,st); // nOps
  skipShort(raw,st); // nSplines
  for(let i=0;i<16;i++)skipShort(raw,st);
  const classStart=st.o;
  return Buffer.concat([
    raw.subarray(0,start),
    writeShort(nOps),
    writeShort(doc.header.nSplines),
    ...roots.map(writeShort),
    raw.subarray(classStart),
  ]);
}
function resolveRef(ref,aliases,max){
  let value=ref;
  if(typeof ref==="string"){
    if(!aliases.has(ref))throw new Error(`unknown operator alias: ${ref}`);
    value=aliases.get(ref);
  }
  if(value==null)return null;
  if(!Number.isInteger(value)||value<0||value>=max)throw new RangeError(`operator reference out of range: ${value}`);
  return value;
}
function encodeOperatorRecord(commandIndex,convention,newIndex,inputs){
  if(commandIndex<0||commandIndex>127)throw new RangeError("KX command index must fit 7 bits");
  const expected=getInputCount(convention);
  if(!(convention&OPC_FLEXINPUT)&&inputs.length!==expected)
    throw new Error(`operator expects ${expected} inputs, received ${inputs.length}`);
  const chunks=[Buffer.from([commandIndex])];
  if(convention&OPC_FLEXINPUT){
    if(inputs.length>255)throw new RangeError("too many flexible inputs");
    chunks.push(Buffer.from([inputs.length]));
  }
  for(const input of inputs){
    if(input>=newIndex)throw new Error("compact KX inputs must point to an earlier operator");
    chunks.push(writeShort(newIndex-1-input));
  }
  return Buffer.concat(chunks);
}
function encodeLinks(convention,links){
  const count=getLinkCount(convention);
  if(links.length>count)throw new Error(`operator accepts ${count} links, received ${links.length}`);
  const padded=[...links,...Array(count-links.length).fill(null)];
  return Buffer.concat(padded.map(x=>writeShort(x==null?0:x+1)));
}
function normalizeAnim(animRaw){
  const b=animRaw==null?Buffer.from([0x01]):Buffer.from(animRaw);
  if(!b.length||b.at(-1)!==0x01)throw new Error("animation bytecode must terminate with KA_END");
  return b;
}

export function appendKxOperators(input,specs,{rootUpdates={}}={}){
  const source=Buffer.isBuffer(input)?input:Buffer.from(input);
  const doc=parseKxGraph(source);
  const aliases=new Map();
  const ops=doc.ops.map(x=>({...x}));
  const originalCount=ops.length;

  for(const spec of specs){
    if(!spec||typeof spec!=="object")throw new TypeError("operator spec must be an object");
    const realId=Number(spec.operatorId);
    const cls=doc.header.classes.find(x=>x.realId===realId);
    if(!cls)throw new Error(`target KX class table lacks operator 0x${realId.toString(16)}`);
    const index=ops.length;
    const inputs=(spec.inputs??[]).map(x=>resolveRef(x,aliases,index));
    if(inputs.some(x=>x==null))throw new Error("operator inputs cannot be null");
    const linkMax=index+1;
    const links=(spec.links??[]).map(x=>resolveRef(x,aliases,linkMax));
    const paramsRaw=spec.paramsRaw==null?Buffer.alloc(0):Buffer.from(spec.paramsRaw);
    const inspected=inspectOperatorParamsRaw(paramsRaw,cls);
    const blobRaw=spec.blobRaw==null?Buffer.alloc(0):Buffer.from(spec.blobRaw);
    if(blobRaw.length!==inspected.blobSize)
      throw new Error(`blob length ${blobRaw.length} != declared ${inspected.blobSize}`);
    const op={
      index,commandIndex:cls.commandIndex,realId:cls.realId,
      convention:cls.convention,packing:cls.packing,typeByte:cls.commandIndex,
      inputCount:inputs.length,inputs,
      operatorRaw:encodeOperatorRecord(cls.commandIndex,cls.convention,index,inputs),
      links,linkRaw:encodeLinks(cls.convention,links),
      paramsRaw,animRaw:normalizeAnim(spec.animRaw),
      blobSize:inspected.blobSize,blobRaw,
    };
    ops.push(op);
    if(spec.id){
      if(aliases.has(spec.id))throw new Error(`duplicate operator alias: ${spec.id}`);
      aliases.set(spec.id,index);
    }
  }

  const roots=[...doc.header.roots];
  for(const [slotKey,ref] of Object.entries(rootUpdates)){
    const slot=Number(slotKey);
    if(!Number.isInteger(slot)||slot<0||slot>=16)throw new RangeError(`root slot out of range: ${slotKey}`);
    roots[slot]=resolveRef(ref,aliases,ops.length);
  }
  const header={...doc.header,nOps:ops.length,roots};
  const mutated={
    ...doc,header,ops,
    headerRaw:rewriteHeader(doc,ops.length,roots),
  };
  const bytes=serializeKxGraph(mutated);
  const reparsed=parseKxGraph(bytes);
  if(reparsed.ops.length!==ops.length)throw new Error("mutated KX op count did not reparse");
  for(let i=originalCount;i<ops.length;i++){
    if(reparsed.ops[i].realId!==ops[i].realId)throw new Error(`appended operator ${i} changed identity after reparse`);
    if(JSON.stringify(reparsed.ops[i].inputs)!==JSON.stringify(ops[i].inputs))
      throw new Error(`appended operator ${i} connections changed after reparse`);
  }
  if(!verifyKxByteRoundTrip(bytes).pass)throw new Error("mutated KX failed lossless codec round-trip");
  return{
    bytes,reparsed,
    originalCount,
    added:reparsed.ops.slice(originalCount).map(x=>({
      index:x.index,operatorId:x.realId,commandIndex:x.commandIndex,
      inputs:x.inputs,links:x.links,
    })),
    roots,
  };
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const [inputPath,outputPath,idText]=process.argv.slice(2);
  if(!idText){
    console.error("usage: node kx-graph-mutate.mjs <input.kx> <output.kx> <operatorId>");
    process.exit(2);
  }
  const operatorId=Number(idText);
  if(!Number.isInteger(operatorId)){console.error("invalid operator id");process.exit(2);}
  const result=appendKxOperators(fs.readFileSync(inputPath),[{id:"added",operatorId}]);
  fs.writeFileSync(outputPath,result.bytes);
  console.log(JSON.stringify({
    pass:true,source:inputPath,output:outputPath,
    originalOps:result.originalCount,finalOps:result.reparsed.ops.length,
    added:result.added,rootsUnchanged:true,
  },null,2));
}
