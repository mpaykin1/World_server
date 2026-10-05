#!/usr/bin/env node
import fs from "node:fs";
import {parseKxClassTable} from "./operator-resolver.mjs";

const OPC_BLOB=0x00080000;
const OPC_FLEXINPUT=0x80000000;
const animExtra=[
  0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,16,4,4,2,0,0,0,8,
];

function need(buf,o,n,label){
  if(o<0||o+n>buf.length)throw new RangeError(`truncated ${label} at ${o}`);
}
function readU8(buf,st,label="u8"){need(buf,st.o,1,label);return buf[st.o++];}
function readU16(buf,st,label="u16"){need(buf,st.o,2,label);const v=buf.readUInt16LE(st.o);st.o+=2;return v;}
function readU32(buf,st,label="u32"){need(buf,st.o,4,label);const v=buf.readUInt32LE(st.o);st.o+=4;return v;}
function readShort(buf,st,label="short"){
  const a=readU8(buf,st,label);
  return (a&0x80)?((a&0x7f)|(readU8(buf,st,label)<<7)):a;
}
function getInputCount(c){return(c&0x00000f00)>>>8;}
function getLinkCount(c){return(c&0x0000f000)>>>12;}
function getStringCount(c){return(c&0x00070000)>>>16;}
function getSplineCount(c){return(c&0x00700000)>>>20;}

function skipCString(buf,st,label){
  while(true){if(readU8(buf,st,label)===0)return;}
}
function skipF16(buf,st,label){
  const first=readU8(buf,st,label);
  if(first!==0x00&&first!==0x80&&first!==0x01&&first!==0x81)readU8(buf,st,label);
}
function skipF24(buf,st,label){
  const first=readU8(buf,st,label);
  if(first!==0x00&&first!==0x01&&first!==0xff){readU8(buf,st,label);readU8(buf,st,label);}
}
function skipPackingValue(buf,st,ch){
  switch(ch.toLowerCase()){
    case "g":skipF16(buf,st,"packed f16");break;
    case "f":skipF24(buf,st,"packed f24");break;
    case "e":need(buf,st.o,2,"packed x16");st.o+=2;break;
    case "i":need(buf,st.o,4,"packed i32");st.o+=4;break;
    case "s":need(buf,st.o,2,"packed i16");st.o+=2;break;
    case "b":need(buf,st.o,1,"packed byte");st.o+=1;break;
    case "c":need(buf,st.o,4,"packed color");st.o+=4;break;
    case "m":need(buf,st.o,3,"packed 24bit");st.o+=3;break;
    case "-":break;
    default:throw new Error(`unknown Krieger packing code: ${ch}`);
  }
}
function calcAnimCodeSize(buf,start){
  let o=start,guard=0;
  while(true){
    need(buf,o,1,"animation opcode");
    const opcode=buf[o];
    let size;
    if(opcode>=0x80)size=2;
    else{
      if(opcode>=animExtra.length)throw new Error(`unknown animation opcode 0x${opcode.toString(16)} at ${o}`);
      size=1+animExtra[opcode];
    }
    need(buf,o,size,"animation command");
    o+=size;
    if(opcode===0x01)return o-start;
    if(++guard>65536)throw new Error("animation bytecode runaway");
  }
}
function raw(buf,a,b){return Buffer.from(buf.subarray(a,b));}

export function parseKxGraph(input){
  const buf=Buffer.isBuffer(input)?input:Buffer.from(input);
  const header=parseKxClassTable(buf);
  const st={o:header.classTableEnd};
  const ops=[];

  const operatorSectionStart=st.o;
  for(let i=0;i<header.nOps;i++){
    const start=st.o;
    const typeByte=readU8(buf,st,"operator type");
    const commandIndex=typeByte&0x7f;
    const cls=header.classes[commandIndex];
    if(!cls)throw new Error(`operator ${i} references missing class index ${commandIndex}`);
    let inputCount;
    if(typeByte&0x80)inputCount=1;
    else inputCount=(cls.convention&OPC_FLEXINPUT)?readU8(buf,st,"flex input count"):getInputCount(cls.convention);
    const inputs=[];
    for(let n=0;n<inputCount;n++){
      const delta=(typeByte&0x80)?0:readShort(buf,st,"input delta");
      const index=i-1-delta;
      if(index<0||index>=i)throw new Error(`operator ${i} input points outside prior graph: ${index}`);
      inputs.push(index);
    }
    ops.push({
      index:i,commandIndex,realId:cls.realId,convention:cls.convention,
      packing:cls.packing,typeByte,inputCount,inputs,
      operatorRaw:raw(buf,start,st.o),
      links:[],linkRaw:Buffer.alloc(0),paramsRaw:Buffer.alloc(0),
      animRaw:Buffer.alloc(0),blobSize:0,blobRaw:Buffer.alloc(0),
    });
  }
  const operatorSectionEnd=st.o;

  const linkSectionStart=st.o;
  for(const op of ops){
    const start=st.o,count=getLinkCount(op.convention),links=[];
    for(let n=0;n<count;n++){
      const encoded=readShort(buf,st,"link index");
      const index=encoded?encoded-1:null;
      if(index!=null&&(index<0||index>=ops.length))throw new Error(`operator ${op.index} link out of range: ${index}`);
      links.push(index);
    }
    op.links=links;op.linkRaw=raw(buf,start,st.o);
  }
  const linkSectionEnd=st.o;

  const parameterSectionStart=st.o;
  for(let commandIndex=0;commandIndex<header.classes.length;commandIndex++){
    for(const op of ops){
      if(op.commandIndex!==commandIndex)continue;
      const start=st.o;
      for(const ch of op.packing)skipPackingValue(buf,st,ch);
      for(let n=0;n<getStringCount(op.convention);n++)skipCString(buf,st,"operator string");
      for(let n=0;n<getSplineCount(op.convention);n++)readU16(buf,st,"operator spline");
      if(op.convention&OPC_BLOB)op.blobSize=readU32(buf,st,"operator blob size");
      op.paramsRaw=raw(buf,start,st.o);
    }
  }
  const parameterSectionEnd=st.o;

  const animationSectionStart=st.o;
  for(const op of ops){
    const size=calcAnimCodeSize(buf,st.o);
    op.animRaw=raw(buf,st.o,st.o+size);
    st.o+=size;
  }
  const animationSectionEnd=st.o;

  const eventSectionStart=st.o;
  const eventCountStart=st.o,eventCount=readShort(buf,st,"event count");
  const eventCountRaw=raw(buf,eventCountStart,st.o),events=[];
  for(let i=0;i<eventCount;i++){
    const start=st.o;
    const opIndex=readShort(buf,st,"event operator");
    if(opIndex<0||opIndex>=ops.length)throw new Error(`event ${i} operator out of range: ${opIndex}`);
    need(buf,st.o,8,"event time");st.o+=8;
    skipF24(buf,st,"event velocity");skipF24(buf,st,"event modulation");
    readU8(buf,st,"event select");
    for(let n=0;n<9;n++)skipF24(buf,st,"event transform");
    need(buf,st.o,4,"event color");st.o+=4;
    readShort(buf,st,"event spline");
    skipF16(buf,st,"event start interval");skipF16(buf,st,"event end interval");
    events.push({index:i,opIndex,raw:raw(buf,start,st.o)});
  }
  const eventSectionEnd=st.o;

  const splineSectionStart=st.o,splines=[];
  for(let i=0;i<header.nSplines;i++){
    const start=st.o,desc=readU8(buf,st,"spline descriptor"),channels=desc&7;
    for(let c=0;c<channels;c++){
      const keys=readShort(buf,st,"spline key count");
      for(let k=0;k<keys;k++){readU8(buf,st,"spline key time");skipF16(buf,st,"spline key value");}
    }
    splines.push({index:i,channels,raw:raw(buf,start,st.o)});
  }
  const splineSectionEnd=st.o;

  const blobSectionStart=st.o;
  for(const op of ops){
    if(!op.blobSize)continue;
    need(buf,st.o,op.blobSize,`blob for op ${op.index}`);
    op.blobRaw=raw(buf,st.o,st.o+op.blobSize);
    st.o+=op.blobSize;
  }
  const blobSectionEnd=st.o;
  const trailingRaw=raw(buf,st.o,buf.length);

  return{
    header,ops,events,splines,eventCount,eventCountRaw,trailingRaw,
    headerRaw:raw(buf,0,header.classTableEnd),
    sections:{
      operators:[operatorSectionStart,operatorSectionEnd],
      links:[linkSectionStart,linkSectionEnd],
      parameters:[parameterSectionStart,parameterSectionEnd],
      animations:[animationSectionStart,animationSectionEnd],
      events:[eventSectionStart,eventSectionEnd],
      splines:[splineSectionStart,splineSectionEnd],
      blobs:[blobSectionStart,blobSectionEnd],
      trailing:[blobSectionEnd,buf.length],
    },
    sourceBytes:buf.length,
  };
}

export function serializeKxGraph(doc){
  const paramOrder=[];
  for(let commandIndex=0;commandIndex<doc.header.classes.length;commandIndex++)
    for(const op of doc.ops)if(op.commandIndex===commandIndex)paramOrder.push(op.paramsRaw);
  return Buffer.concat([
    doc.headerRaw,
    ...doc.ops.map(x=>x.operatorRaw),
    ...doc.ops.map(x=>x.linkRaw),
    ...paramOrder,
    ...doc.ops.map(x=>x.animRaw),
    doc.eventCountRaw,
    ...doc.events.map(x=>x.raw),
    ...doc.splines.map(x=>x.raw),
    ...doc.ops.map(x=>x.blobRaw),
    doc.trailingRaw,
  ]);
}

export function verifyKxByteRoundTrip(input){
  const source=Buffer.isBuffer(input)?input:Buffer.from(input);
  const doc=parseKxGraph(source),encoded=serializeKxGraph(doc);
  return{
    pass:encoded.equals(source),
    sourceBytes:source.length,encodedBytes:encoded.length,
    ops:doc.ops.length,classes:doc.header.classes.length,
    events:doc.events.length,splines:doc.splines.length,
    blobs:doc.ops.filter(x=>x.blobSize>0).length,
    oldLayout:doc.header.oldLayout,
    sections:doc.sections,
  };
}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const file=process.argv[2];
  if(!file){console.error("usage: node kx-graph-codec.mjs <file.kx>");process.exit(2);}
  const report=verifyKxByteRoundTrip(fs.readFileSync(file));
  console.log(JSON.stringify(report,null,2));
  if(!report.pass)process.exit(1);
}
