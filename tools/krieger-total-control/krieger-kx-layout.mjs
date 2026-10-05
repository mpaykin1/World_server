import{
  KRIEGER_KX_FORMAT,MAX_OP_ROOT,OPC_BLOB,OPC_FLEXINPUT,Reader,align4,
  inputCount,linkCount,minimumPackedParamBytes,parseAnim,readF16Encoded,
  readF24Encoded,readPackedSlot,splineCount,stringCount,asBytes,
}from'./krieger-kx-codec.mjs';
export{KRIEGER_KX_FORMAT,minimumPackedParamBytes}from'./krieger-kx-codec.mjs';

function classInfo(classes,index){
  const c=classes[index];if(!c)throw new Error(`operator references missing class index ${index}`);return c;
}
export function parseKriegerKx(input){
  const bytes=asBytes(input),r=new Reader(bytes);let flagsOffset=0,flags=r.u32(),oldLayout=false;
  if(flags&~7){oldLayout=true;flags=2;r.pos=0;flagsOffset=null;}
  if(flags&1)r.skip(32);
  const songSize=r.u32();r.skip(align4(songSize));let sampleSize=0;
  if(flags&2){sampleSize=r.u32();r.skip(align4(sampleSize));}
  const songBpm=r.u32(),songLength=r.u32(),nOpsOffset=r.pos,nOps=r.compact(),nSplinesOffset=r.pos,nSplines=r.compact();
  const roots=[],rootOffsets=[];for(let i=0;i<MAX_OP_ROOT;i++){rootOffsets.push(r.pos);roots.push(r.compact());}
  const classes=[],classesStart=r.pos;
  while(true){
    const start=r.pos,conv=r.u32();if(conv===0)break;
    const operatorId=oldLayout?r.u8():r.u16(),packStart=r.pos,cs=r.cstr();let pack='';
    for(let i=packStart;i<cs.end-1;i++)pack+=String.fromCharCode(bytes[i]);
    classes.push({index:classes.length,operatorId,convention:conv>>>0,pack,start,end:r.pos,minParamByteLength:minimumPackedParamBytes(pack)});
  }
  const classesEnd=r.pos,ops=Array.from({length:nOps},(_,index)=>({index})),treeStart=r.pos;
  for(let i=0;i<nOps;i++)parseTreeOp(r,ops,i,classes);
  const treeEnd=r.pos,linksStart=r.pos;for(const op of ops)parseLinks(r,op,nOps);const linksEnd=r.pos;
  const paramsStart=r.pos,classParamBoundaries=[];
  for(const cls of classes)classParamBoundaries.push(parseClassParams(r,bytes,cls,ops));
  const paramsEnd=r.pos,animStart=r.pos;
  for(const op of ops){const a=parseAnim(bytes,r.pos);op.animStart=a.start;op.animEnd=a.end;r.pos=a.end;}
  const animEnd=r.pos,eventsStart=r.pos,eventCountOffset=r.pos,eventCount=r.compact(),events=[];
  for(let i=0;i<eventCount;i++)events.push(parseEvent(r,i,nOps));
  const eventsEnd=r.pos,splinesStart=r.pos,splines=[];
  for(let i=0;i<nSplines;i++)splines.push(parseSpline(r,i));
  const splinesEnd=r.pos,blobsStart=r.pos;
  for(const op of ops){op.blobStart=r.pos;r.skip(op.blobSize||0);op.blobEnd=r.pos;}
  const blobsEnd=r.pos;
  return{oldLayout,flags,flagsOffset,songSize,sampleSize,songBpm,songLength,nOps,nOpsOffset,nSplines,nSplinesOffset,roots,rootOffsets,classes,ops,classParamBoundaries,eventCount,eventCountOffset,events,splines,sections:{classesStart,classesEnd,treeStart,treeEnd,linksStart,linksEnd,paramsStart,paramsEnd,animStart,animEnd,eventsStart,eventsEnd,splinesStart,splinesEnd,blobsStart,blobsEnd,end:r.pos},trailingBytes:bytes.length-r.pos};
}
function parseTreeOp(r,ops,i,classes){
  const start=r.pos,typeByte=r.u8(),classIndex=typeByte&0x7f,cls=classInfo(classes,classIndex),compressed=(typeByte&0x80)!==0;
  const count=compressed?1:(cls.convention&OPC_FLEXINPUT)?r.u8():inputCount(cls.convention),inputs=[];
  for(let j=0;j<count;j++){
    const delta=compressed?0:r.compact(),dest=i-1-delta;
    if(dest<0||dest>=i)throw new Error(`invalid input delta at op ${i}`);inputs.push(dest);
  }
  Object.assign(ops[i],{treeStart:start,treeEnd:r.pos,typeByte,classIndex,operatorId:cls.operatorId,convention:cls.convention,pack:cls.pack,inputs,compressed});
}
function parseLinks(r,op,nOps){
  const count=linkCount(op.convention),links=[];op.linksStart=r.pos;
  for(let i=0;i<count;i++){
    const encoded=r.compact(),dest=encoded?encoded-1:null;
    if(dest!=null&&(dest<0||dest>=nOps))throw new Error(`invalid link at op ${op.index}`);links.push(dest);
  }
  op.links=links;op.linksEnd=r.pos;
}
function parseClassParams(r,bytes,cls,ops){
  const classStart=r.pos;
  for(const op of ops){
    if(op.classIndex!==cls.index)continue;
    op.paramsStart=r.pos;op.paramSlots=[];
    for(let slot=0;slot<cls.pack.length;slot++)op.paramSlots.push({slot,code:cls.pack[slot],...readPackedSlot(r,cls.pack[slot])});
    op.strings=[];for(let i=0;i<stringCount(op.convention);i++)op.strings.push({index:i,...r.cstr()});
    op.splineRefs=[];for(let i=0;i<splineCount(op.convention);i++){const start=r.pos,value=r.u16();op.splineRefs.push({index:i,start,end:r.pos,value});}
    if(op.convention&OPC_BLOB){op.blobSizeOffset=r.pos;op.blobSize=r.u32();}else op.blobSize=0;
    op.paramsEnd=r.pos;
  }
  return{classIndex:cls.index,start:classStart,end:r.pos};
}
function parseEvent(r,index,nOps){
  const start=r.pos,opIndex=r.compact();if(opIndex>=nOps)throw new Error(`event ${index} references missing op ${opIndex}`);
  r.skip(8);readF24Encoded(r);readF24Encoded(r);r.skip(1);for(let j=0;j<9;j++)readF24Encoded(r);r.skip(4);
  const splineRef=r.compact();readF16Encoded(r);readF16Encoded(r);return{index,start,end:r.pos,opIndex,splineRef};
}
function parseSpline(r,index){
  const start=r.pos,header=r.u8(),count=header&7,interpolation=header>>>3,channels=[];
  for(let c=0;c<count;c++){
    const keyCount=r.compact(),keysStart=r.pos;for(let k=0;k<keyCount;k++){r.skip(1);readF16Encoded(r);}
    channels.push({index:c,keyCount,keysStart,keysEnd:r.pos});
  }
  return{index,start,end:r.pos,count,interpolation,channels};
}
export function inspectKriegerClassTable(input){
  return parseKriegerKx(input).classes.map(c=>({index:c.index,operatorId:c.operatorId,convention:c.convention,pack:c.pack,minParamByteLength:c.minParamByteLength}));
}
