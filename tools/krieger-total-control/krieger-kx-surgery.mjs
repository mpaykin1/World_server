import{
  KA_END,MAX_OP_ROOT,OPC_BLOB,OPC_FLEXINPUT,asBytes,concat,cstringBytes,
  inputCount,insert,linkCount,parseAnim,patchCompactInPlace,splineCount,
  stringCount,validateRawParamBytes,writeCompact,writeU32,zeroParamBytes,
}from'./krieger-kx-codec.mjs';
import{parseKriegerKx}from'./krieger-kx-layout.mjs';

function normalizeParamBytes(cls,paramBytes){
  const raw=paramBytes==null?zeroParamBytes(cls.pack):asBytes(paramBytes);return validateRawParamBytes(cls.pack,raw);
}
function paramRecord(cls,draft){
  const parts=[normalizeParamBytes(cls,draft.paramBytes)],sc=stringCount(cls.convention),strings=draft.strings??[];
  if(strings.length!==sc)throw new Error(`operator requires ${sc} strings`);for(const s of strings)parts.push(cstringBytes(s));
  const spc=splineCount(cls.convention),srefs=draft.splineRefs??Array(spc).fill(0);
  if(srefs.length!==spc)throw new Error(`operator requires ${spc} spline refs`);for(const ref of srefs)parts.push(writeCompact(ref));
  const blob=asBytes(draft.blob??[]);
  if(cls.convention&OPC_BLOB)parts.push(writeU32(blob.length));else if(blob.length)throw new Error('blob supplied for non-blob operator');
  return{record:concat(parts),blob};
}
function treeRecord(cls,draft,newIndex){
  if(cls.index>=128)throw new Error('class index cannot fit KX type byte');
  const inputs=draft.inputs??[],flexible=Boolean(cls.convention&OPC_FLEXINPUT),expected=inputCount(cls.convention);
  if(!flexible&&inputs.length!==expected)throw new Error(`operator 0x${cls.operatorId.toString(16)} requires ${expected} inputs`);
  if(flexible&&inputs.length>255)throw new RangeError('too many flexible inputs');
  const parts=[Uint8Array.of(cls.index)];if(flexible)parts.push(Uint8Array.of(inputs.length));
  for(const dest of inputs){
    if(!Number.isInteger(dest)||dest<0||dest>=newIndex)throw new Error(`invalid new-op input ${dest}`);
    parts.push(writeCompact(newIndex-1-dest));
  }
  return concat(parts);
}
function linkRecord(parsed,cls,draft){
  const count=linkCount(cls.convention),links=draft.links??Array(count).fill(null),parts=[];
  if(links.length!==count)throw new Error(`operator requires ${count} links`);
  for(const dest of links){
    if(dest==null)parts.push(writeCompact(0));
    else{
      if(!Number.isInteger(dest)||dest<0||dest>=parsed.nOps)throw new Error(`invalid new-op link ${dest}`);
      parts.push(writeCompact(dest+1));
    }
  }
  return concat(parts);
}
function verifyAnim(anim){
  const bytes=asBytes(anim??[KA_END]),parsed=parseAnim(bytes,0);
  if(parsed.end!==bytes.length)throw new Error('animation code has trailing bytes');return bytes;
}
export function appendKriegerOperator(input,draft){
  const original=asBytes(input),parsed=parseKriegerKx(original);
  if(parsed.nOps>=32767)throw new RangeError('Krieger operator limit reached');
  const cls=parsed.classes.find(x=>x.operatorId===Number(draft.operatorId));
  if(!cls)throw new Error(`operator class 0x${Number(draft.operatorId).toString(16)} is absent from this .kx class table`);
  const newIndex=parsed.nOps,tree=treeRecord(cls,draft,newIndex),links=linkRecord(parsed,cls,draft),{record:params,blob}=paramRecord(cls,draft),anim=verifyAnim(draft.animCode);
  let out=original.slice();patchCompactInPlace(out,parsed.nOpsOffset,parsed.nOps,parsed.nOps+1);
  for(const slot of draft.makeRootSlots??[]){
    if(!Number.isInteger(slot)||slot<0||slot>=MAX_OP_ROOT)throw new RangeError(`invalid root slot ${slot}`);
    patchCompactInPlace(out,parsed.rootOffsets[slot],parsed.roots[slot],newIndex);
  }
  const paramInsert=parsed.classParamBoundaries[cls.index].end;
  out=insert(out,parsed.sections.blobsEnd,blob);out=insert(out,parsed.sections.animEnd,anim);
  out=insert(out,paramInsert,params);out=insert(out,parsed.sections.linksEnd,links);out=insert(out,parsed.sections.treeEnd,tree);
  const check=parseKriegerKx(out),added=check.ops.at(-1);
  if(check.nOps!==parsed.nOps+1)throw new Error('post-write operator count mismatch');
  if(added.operatorId!==cls.operatorId)throw new Error('post-write operator class mismatch');
  if(draft.makeRootSlots?.some(slot=>check.roots[slot]!==newIndex))throw new Error('post-write root mismatch');
  return{bytes:out,parsed:check,added};
}
