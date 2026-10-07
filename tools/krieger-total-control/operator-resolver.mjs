#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export const PINNED_KKRIEGER_COMMIT="3bf0ff017372e640e966c2785a4d95a998cec242";
export const CORE_OPERATOR_IDS=[
  0x07,0x0c,0x11,0x63,0x64,
  0x81,0x82,0x87,0x88,0x89,0x8a,0x8c,0x8f,0x90,0x96,0x9a,0x9c,0x9d,0xa5,0xa6,0xb3,
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

function stripCppComments(source){
  return source.replace(/\/\*[\s\S]*?\*\//g,"").replace(/\/\/.*$/gm,"");
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

export function parseWerkClassRegistry(source){
  source=stripCppComments(source);
  const byId=new Map();
  const head=/\{\s*"([^"]+)"\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,\s*([A-Za-z_]\w*)\s*,\s*([^,]+)\s*,\s*([^,]+)\s*,\s*(0x[0-9a-fA-F]+|\d+)/g;
  for(const m of source.matchAll(head)){
    const id=Number(m[2]);
    if(!Number.isInteger(id)||id<=0)continue;
    const blockStart=m.index;
    const blockEnd=source.indexOf("\n  },",blockStart);
    if(blockEnd<0)continue;
    const block=source.slice(blockStart,blockEnd);
    const editPos=block.search(/\bEdit_[A-Za-z0-9_]+\s*,/);
    if(editPos<0)continue;
    const prefix=block.slice(0,editPos);
    const strings=[...prefix.matchAll(/"([^"]*)"/g)].map(x=>x[1]);
    const packing=strings.slice(1).join("");
    const handlers=block.slice(editPos).match(/\b(Edit_[A-Za-z0-9_]+)\s*,\s*([A-Za-z_]\w*)\s*,\s*([A-Za-z_]\w*)\s*,/);
    if(!handlers)continue;
    const entry={
      name:m[1],id,objectClass:m[3],
      convention:Number(m[6]),packing,
      editHandler:handlers[1],initHandler:handlers[2],execHandler:handlers[3],
      source:"WerkClasses",
    };
    const previous=byId.get(id);
    if(previous)throw new Error(`duplicate WerkClass id 0x${id.toString(16)}`);
    byId.set(id,entry);
  }
  if(byId.size<100)throw new Error(`WerkClasses registry unexpectedly small: ${byId.size}`);
  return byId;
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
  const classTableStart=st.o;
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
    classTableStart,
    classTableEnd:st.o,
    classes,
  };
}

export function parseWerkClassMetadata(source){
  source=stripCppComments(source);
  const byId=new Map();
  const re=/\{\s*"[^"]*"\s*,\s*(0x[0-9a-fA-F]+|\d+)\s*,[^\n]*?\b(0x[0-9a-fA-F]{8})\s*,\s*COL_[^,]+,[^\n]*\n((?:\s*"(?:[^"\\]|\\.)*"\s*)+)/g;
  for(const m of source.matchAll(re)){
    const id=Number(m[1]),convention=Number(m[2]);
    const packing=[...m[3].matchAll(/"([^"]*)"/g)].map(x=>x[1]).join("");
    const previous=byId.get(id);
    const entry={realId:id,convention,packing,source:"werkops.cpp"};
    if(previous&&(previous.convention!==convention||previous.packing!==packing))
      throw new Error(`WerkClass metadata collision 0x${id.toString(16)}`);
    byId.set(id,entry);
  }
  if(byId.size===0)throw new Error("no WerkClass metadata parsed");
  return byId;
}

function encodeClassEntry(entry,oldLayout){
  if(!Number.isInteger(entry.realId)||entry.realId<=0)throw new TypeError("realId must be a positive integer");
  if(oldLayout&&entry.realId>0xff)throw new RangeError("old .kx layout only supports one-byte class ids");
  if(!Number.isInteger(entry.convention)||entry.convention<=0)throw new TypeError("convention must be a positive uint32");
  const packing=String(entry.packing??"");
  if(packing.includes("\0"))throw new TypeError("packing may not contain NUL");
  const id=Buffer.alloc(oldLayout?1:2);
  if(oldLayout)id.writeUInt8(entry.realId);
  else id.writeUInt16LE(entry.realId);
  const conv=Buffer.alloc(4);conv.writeUInt32LE(entry.convention>>>0);
  return Buffer.concat([conv,id,Buffer.from(packing+"\0","ascii")]);
}

export function extendKxClassTable(input,entries){
  const original=Buffer.isBuffer(input)?input:Buffer.from(input);
  const parsed=parseKxClassTable(original);
  const existing=new Map(parsed.classes.map(c=>[c.realId,c]));
  const additions=[];
  for(const raw of entries??[]){
    const entry={realId:Number(raw.realId??raw.id),convention:Number(raw.convention),packing:String(raw.packing??"")};
    const hit=existing.get(entry.realId);
    if(hit){
      if(hit.convention!==entry.convention||hit.packing!==entry.packing)
        throw new Error(`class 0x${entry.realId.toString(16)} already exists with different convention/packing`);
      continue;
    }
    existing.set(entry.realId,entry);
    additions.push(entry);
  }
  if(parsed.classes.length+additions.length>128)throw new RangeError("compact .kx command index supports at most 128 file classes");
  if(!additions.length)return{bytes:Buffer.from(original),added:[],parsed};

  const prefix=original.subarray(0,parsed.classTableStart);
  const originalClassBytes=original.subarray(parsed.classTableStart,parsed.classTableEnd-4);
  const suffix=original.subarray(parsed.classTableEnd);
  const appended=additions.map(x=>encodeClassEntry(x,parsed.oldLayout));
  const terminator=Buffer.alloc(4);
  const bytes=Buffer.concat([prefix,originalClassBytes,...appended,terminator,suffix]);
  const reparsed=parseKxClassTable(bytes);
  const added=additions.map((x,i)=>({...x,commandIndex:parsed.classes.length+i}));
  for(const x of added){
    const got=reparsed.classes[x.commandIndex];
    if(!got||got.realId!==x.realId||got.convention!==x.convention||got.packing!==x.packing)
      throw new Error(`class-table extension did not round-trip operator 0x${x.realId.toString(16)}`);
  }
  const newSuffix=bytes.subarray(reparsed.classTableEnd);
  if(!newSuffix.equals(suffix))throw new Error("class-table extension changed binary tail");
  return{bytes,added,parsed:reparsed};
}

export function extendTargetWithResolvedClasses(target,resolution){
  if(!resolution?.pass)throw new Error("refuse class-table write from unresolved operator set");
  const additions=resolution.resolved.filter(x=>x.commandIndex==null).map(x=>({
    realId:x.id,convention:x.convention,packing:x.packing,
  }));
  return extendKxClassTable(target,additions);
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

export function resolveOperatorIds({target,oplist,catalog,sourceCatalog=new Map(),editorMetadata=new Map(),operatorIds=CORE_OPERATOR_IDS}){
  const parsed=parseKxClassTable(target);
  const metadata=sourceCatalog.size?sourceCatalog:editorMetadata;
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
      const measured=variants[0],editor=metadata.get(id);
      if(editor&&(editor.convention!==measured.convention||editor.packing!==measured.packing)){
        ambiguous.push({id,handler,variants:[measured,editor],reason:"donor/editor-metadata mismatch"});
      }else{
        resolved.push({...handler,...measured,commandIndex:null,mode:"class-extension-measured"});
      }
    }else if(variants.length>1){
      ambiguous.push({id,handler,variants});
    }else{
      const editor=metadata.get(id);
      if(editor)resolved.push({...handler,...editor,realId:editor.realId??editor.id,commandIndex:null,mode:sourceCatalog.size?"class-extension-source":"class-extension-editor-metadata"});
      else missing.push({id,handler,reason:"missing-convention"});
    }
  }
  return{parsed,resolved,missing,ambiguous,pass:missing.length===0&&ambiguous.length===0};
}

export function loadUpstreamResolver(upstreamRoot,targetName="kkrieger3383.kx"){
  const oplistPath=path.join(upstreamRoot,"player_kkrieger","kkrieger_oplist.cpp");
  const registryPath=path.join(upstreamRoot,"werkops.cpp");
  const dataDir=path.join(upstreamRoot,"data");
  const oplist=parseKkriegerOplist(fs.readFileSync(oplistPath,"utf8"));
  const registrySource=fs.readFileSync(registryPath,"utf8");
  const sourceCatalog=parseWerkClassRegistry(registrySource);
  const editorMetadata=parseWerkClassMetadata(registrySource);
  const names=fs.readdirSync(dataDir).filter(x=>x.endsWith(".kx")).sort();
  const docs=names.map(name=>({name,bytes:fs.readFileSync(path.join(dataDir,name))}));
  const catalog=buildConventionCatalog(docs);
  const target=fs.readFileSync(path.join(dataDir,targetName));
  return{oplist,catalog,sourceCatalog,editorMetadata,target,documents:names};
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
  const result=resolveOperatorIds({target:loaded.target,oplist:loaded.oplist,catalog:loaded.catalog,sourceCatalog:loaded.sourceCatalog});
  const extension=result.pass?extendTargetWithResolvedClasses(loaded.target,result):null;
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
    classTableWrite:extension?{
      added:extension.added.map(x=>({operatorId:hex(x.realId),commandIndex:x.commandIndex,convention:`0x${x.convention.toString(16).padStart(8,"0")}`,packing:x.packing})),
      finalClassCount:extension.parsed.classes.length,
      tailPreserved:true,
      reparsed:true,
    }:null,
  };
  console.log(JSON.stringify(report,null,2));
  if(!result.pass)process.exit(1);
}
