#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export const PINNED_KKRIEGER_COMMIT="3bf0ff017372e640e966c2785a4d95a998cec242";
export const CORE_OPERATOR_IDS=[
  0x07,0x0c,0x11,0x63,0x64,
  0x81,0x82,0x87,0x88,0x8f,0x90,0x9a,0x9c,0x9d,0xa5,0xa6,0xb3,
  0xc0,0xc3,0xcb,0xcd,0xce,0xd0,0xd1,
];

function need(buf,offset,count,label){
  if(offset<0||offset+count>buf.length)throw new RangeError(`truncated ${label} at ${offset}`);
}
function u8(buf,state,label="u8"){need(buf,state.o,1,label);return buf[state.o++];}
function u16(buf,state,label="u16"){need(buf,state.o,2,label);const v=buf.readUInt16LE(state.o);state.o+=2;return v;}
function u32(buf,state,label="u32"){need(buf,state.o,4,label);const v=buf.readUInt32LE(state.o);state.o+=4;return v;}
function readShort(buf,state,label="short"){
  const a=u8(buf,state,label);
  return (a&0x80)?((a&0x7f)|(u8(buf,state,label)<<7)):a;
}
function align4(n){return (n+3)&~3;}
function cstring(buf,state,label="cstring"){
  const start=state.o;
  while(true){
    need(buf,state.o,1,label);
    if(buf[state.o++]===0)break;
  }
  return buf.subarray(start,state.o-1).toString("ascii");
}

export function parseKkriegerOplist(source){
  const byId=new Map(),byHandler=new Map();
  const re=/^\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,/gm;
  for(const m of source.matchAll(re)){
    const id=Number(m[1]);
    if(!Number.isInteger(id)||id<=0)continue;
    const entry={id,initHandler:m[2],execHandler:m[3]};
    const previous=byId.get(id);
    if(previous&&(previous.initHandler!==entry.initHandler||previous.execHandler!==entry.execHandler))
      throw new Error(`operator id collision 0x${id.toString(16)}`);
    byId.set(id,entry);
    byHandler.set(entry.initHandler,entry);
    byHandler.set(entry.execHandler,entry);
  }
  if(byId.size<50)throw new Error(`operator table unexpectedly small: ${byId.size}`);
  return{byId,byHandler,entries:[...byId.values()].sort((a,b)=>a.id-b.id)};
}

export function parseKxClassTable(input){
  const buf=Buffer.isBuffer(input)?input:Buffer.from(input);
  const st={o:0};
  need(buf,0,4,"kx header");
  const first=buf.readUInt32LE(0);
  const oldLayout=(first&~7)!==0;
  const flags=oldLayout?2:u32(buf,st,"flags");

  if(flags&1){need(buf,st.o,32,"header extension");st.o+=32;}
  const songSize=u32(buf,st,"song size");
  need(buf,st.o,align4(songSize),"song");st.o+=align4(songSize);
  let sampleSize=0;
  if(flags&2){
    sampleSize=u32(buf,st,"sample size");
    need(buf,st.o,align4(sampleSize),"sample");st.o+=align4(sampleSize);
  }
  const bpm=u32(buf,st,"bpm");
  const songLength=u32(buf,st,"song length");
  const nOps=readShort(buf,st,"op count");
  const nSplines=readShort(buf,st,"spline count");
  const roots=Array.from({length:16},()=>readShort(buf,st,"root"));

  const classes=[];
  while(true){
    const convention=u32(buf,st,"class convention");
    if(convention===0)break;
    const realId=oldLayout?u8(buf,st,"old class id"):u16(buf,st,"class id");
    const packing=cstring(buf,st,"packing");
    classes.push({
      commandIndex:classes.length,
      realId,
      convention,
      conventionHex:`0x${convention.toString(16).padStart(8,"0")}`,
      packing,
    });
    if(classes.length>256)throw new RangeError("too many classes");
  }

  return{
    oldLayout,flags,songSize,sampleSize,bpm,songLength,nOps,nSplines,roots,
    classTableOffset:st.o,
    classes,
  };
}

export function buildConventionCatalog(documents){
  const variants=new Map();
  for(const doc of documents){
    const parsed=parseKxClassTable(doc.bytes);
    for(const cls of parsed.classes){
      if(!variants.has(cls.realId))variants.set(cls.realId,new Map());
      const key=`${cls.convention}|${cls.packing}`;
      const bucket=variants.get(cls.realId);
      if(!bucket.has(key))bucket.set(key,{realId:cls.realId,convention:cls.convention,packing:cls.packing,documents:[]});
      bucket.get(key).documents.push(doc.name);
    }
  }
  return new Map([...variants].map(([id,m])=>[id,[...m.values()]]));
}

export function resolveOperatorIds({target,oplist,catalog,operatorIds=CORE_OPERATOR_IDS}){
  const parsed=parseKxClassTable(target);
  const local=new Map(parsed.classes.map(c=>[c.realId,c]));
  const resolved=[],missing=[],ambiguous=[];
  for(const id of operatorIds){
    const handler=oplist.byId.get(id);
    if(!handler){missing.push({id,reason:"missing-handler"});continue;}
    const hit=local.get(id);
    if(hit){
      resolved.push({...handler,...hit,mode:"target-class"});
      continue;
    }
    const variants=catalog.get(id)??[];
    if(variants.length===1){
      resolved.push({...handler,...variants[0],commandIndex:null,mode:"class-extension"});
    }else if(variants.length>1){
      ambiguous.push({id,handler,variants});
    }else{
      missing.push({id,handler,reason:"missing-convention"});
    }
  }
  return{parsed,resolved,missing,ambiguous,pass:missing.length===0&&ambiguous.length===0};
}

export function loadUpstreamResolver(upstreamRoot,targetName="kkrieger3383.kx"){
  const oplistPath=path.join(upstreamRoot,"player_kkrieger","kkrieger_oplist.cpp");
  const dataDir=path.join(upstreamRoot,"data");
  const oplist=parseKkriegerOplist(fs.readFileSync(oplistPath,"utf8"));
  const names=fs.readdirSync(dataDir).filter(x=>x.endsWith(".kx")).sort();
  const docs=names.map(name=>({name,bytes:fs.readFileSync(path.join(dataDir,name))}));
  const catalog=buildConventionCatalog(docs);
  const target=fs.readFileSync(path.join(dataDir,targetName));
  return{oplist,catalog,target,documents:names};
}

function hex(id){return"0x"+id.toString(16).padStart(2,"0");}

if(import.meta.url===new URL(`file://${process.argv[1]}`).href){
  const root=process.argv[2];
  const targetName=process.argv[3]??"kkrieger3383.kx";
  if(!root){
    console.error("usage: node operator-resolver.mjs <werkkzeug3_kkrieger-root> [target.kx]");
    process.exit(2);
  }
  const loaded=loadUpstreamResolver(root,targetName);
  const result=resolveOperatorIds({target:loaded.target,oplist:loaded.oplist,catalog:loaded.catalog});
  const report={
    pass:result.pass,
    upstreamCommit:PINNED_KKRIEGER_COMMIT,
    target:targetName,
    documentsScanned:loaded.documents,
    targetOldLayout:result.parsed.oldLayout,
    targetOps:result.parsed.nOps,
    targetClasses:result.parsed.classes.length,
    resolved:result.resolved.map(x=>({
      operatorId:hex(x.id),handler:x.initHandler,commandIndex:x.commandIndex,
      convention:x.conventionHex??(`0x${x.convention.toString(16).padStart(8,"0")}`),
      packing:x.packing,mode:x.mode,
    })),
    missing:result.missing.map(x=>({...x,id:hex(x.id)})),
    ambiguous:result.ambiguous.map(x=>({...x,id:hex(x.id)})),
  };
  console.log(JSON.stringify(report,null,2));
  if(!result.pass)process.exit(1);
}
