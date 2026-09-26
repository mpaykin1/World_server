/** Original portable palette + RLE codec for independent voxel section snapshots. */
export function encodeOriginalPaletteSection(blocks){
 if(!(blocks instanceof Uint16Array)||blocks.length<1||blocks.length>4096)throw new RangeError('section');
 const palette=[],lookup=new Map(),runs=[];let last=-1,count=0;
 for(const block of blocks){
  let id=lookup.get(block);
  if(id===undefined){id=palette.length;palette.push(block);lookup.set(block,id);}
  if(id===last&&count<65535)count++;
  else{if(count)runs.push(count,last);last=id;count=1;}
 }
 runs.push(count,last);
 return {version:1,length:blocks.length,palette,runs};
}
export function decodeOriginalPaletteSection(snapshot){
 if(!snapshot||snapshot.version!==1||!Number.isInteger(snapshot.length)||snapshot.length<1||snapshot.length>4096||!Array.isArray(snapshot.palette)||snapshot.palette.length<1||snapshot.palette.length>4096||!Array.isArray(snapshot.runs)||snapshot.runs.length<2||snapshot.runs.length%2!==0||snapshot.palette.some(v=>!Number.isInteger(v)||v<0||v>65535)||new Set(snapshot.palette).size!==snapshot.palette.length)throw new RangeError('snapshot');
 const out=new Uint16Array(snapshot.length);let offset=0;
 for(let i=0;i<snapshot.runs.length;i+=2){
  const count=snapshot.runs[i],id=snapshot.runs[i+1];
  if(!Number.isInteger(count)||count<1||!Number.isInteger(id)||id<0||id>=snapshot.palette.length||offset+count>out.length)throw new RangeError('run');
  out.fill(snapshot.palette[id],offset,offset+count);offset+=count;
 }
 if(offset!==out.length)throw new RangeError('incomplete snapshot');
 return out;
}
