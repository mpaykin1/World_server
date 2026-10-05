export const MAX_OP_ROOT=16;
export const OPC_BLOB=0x00080000;
export const OPC_FLEXINPUT=0x80000000>>>0;
export const KA_END=0x01;
const CMD_SIZE=[
  0,0,1,1,1,1,1,0,0,0,0,0,0,0,0,0,
  0,0,0,0,0,0,16,4,4,2,0,0,0,8,
];
export const KRIEGER_KX_FORMAT=Object.freeze({
  source:'KDoc::Init',
  upstream:'MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242',
  maxRoots:MAX_OP_ROOT,
});
export const inputCount=conv=>(conv>>>8)&0x0f;
export const linkCount=conv=>(conv>>>12)&0x0f;
export const stringCount=conv=>(conv>>>16)&0x07;
export const splineCount=conv=>(conv>>>20)&0x07;
export function asBytes(value){
  if(value instanceof Uint8Array)return value;
  if(ArrayBuffer.isView(value))return new Uint8Array(value.buffer,value.byteOffset,value.byteLength);
  if(value instanceof ArrayBuffer)return new Uint8Array(value);
  if(Array.isArray(value))return Uint8Array.from(value);
  throw new TypeError('expected byte array');
}
export class Reader{
  constructor(bytes){
    this.bytes=asBytes(bytes);
    this.view=new DataView(this.bytes.buffer,this.bytes.byteOffset,this.bytes.byteLength);
    this.pos=0;
  }
  need(n){if(this.pos+n>this.bytes.length)throw new RangeError(`truncated .kx at ${this.pos}, need ${n}`);}
  u8(){this.need(1);return this.bytes[this.pos++];}
  u16(){this.need(2);const v=this.view.getUint16(this.pos,true);this.pos+=2;return v;}
  u32(){this.need(4);const v=this.view.getUint32(this.pos,true);this.pos+=4;return v;}
  compact(){let v=this.u8();if(v&0x80)v=(v&0x7f)|(this.u8()<<7);return v;}
  skip(n){this.need(n);this.pos+=n;}
  cstr(){const start=this.pos;while(this.u8()!==0){}return{start,end:this.pos};}
}
export const align4=n=>(n+3)&~3;
export function fixedPackSize(ch){
  switch(ch.toLowerCase()){
    case'g':case'f':return null;
    case'e':case's':return 2;
    case'i':case'c':return 4;
    case'b':return 1;
    case'm':return 3;
    case'-':return 0;
    default:throw new Error(`unsupported Krieger pack code ${JSON.stringify(ch)}`);
  }
}
export function readPackedSlot(r,ch){
  const start=r.pos,code=ch.toLowerCase();
  if(code==='g'){
    const first=r.u8();if(![0x00,0x80,0x01,0x81].includes(first))r.skip(1);
  }else if(code==='f'){
    const first=r.u8();if(![0x00,0x01,0xff].includes(first))r.skip(2);
  }else r.skip(fixedPackSize(code));
  return{start,end:r.pos,size:r.pos-start};
}
export function minimumPackedParamBytes(pack=''){
  let total=0;
  for(const ch of pack){const fixed=fixedPackSize(ch);total+=fixed==null?1:fixed;}
  return total;
}
export function zeroParamBytes(pack=''){
  const parts=[];
  for(const ch of pack){const fixed=fixedPackSize(ch);parts.push(fixed==null?Uint8Array.of(0):new Uint8Array(fixed));}
  return concat(parts);
}
export function validateRawParamBytes(pack,raw){
  const r=new Reader(raw);for(const ch of pack)readPackedSlot(r,ch);
  if(r.pos!==raw.length)throw new Error(`packed params have ${raw.length-r.pos} trailing bytes`);
  return raw;
}
export function readF16Encoded(r){
  const start=r.pos,first=r.u8();if(![0x00,0x80,0x01,0x81].includes(first))r.skip(1);return{start,end:r.pos};
}
export function readF24Encoded(r){
  const start=r.pos,first=r.u8();if(![0x00,0x01,0xff].includes(first))r.skip(2);return{start,end:r.pos};
}
function animCommandSize(bytes,offset){
  const op=bytes[offset];
  if(op===undefined)throw new RangeError('truncated animation code');
  if(op>=0x80)return 2;
  if(op>=CMD_SIZE.length)throw new Error(`unknown animation opcode 0x${op.toString(16)}`);
  return 1+CMD_SIZE[op];
}
export function parseAnim(bytes,start){
  let pos=start;
  while(true){
    const op=bytes[pos],size=animCommandSize(bytes,pos);pos+=size;
    if(pos>bytes.length)throw new RangeError('truncated animation payload');
    if(op===KA_END)return{start,end:pos};
  }
}
export function writeCompact(value){
  if(!Number.isInteger(value)||value<0||value>32767)throw new RangeError('compact short must be 0..32767');
  return value<=127?Uint8Array.of(value):Uint8Array.of((value&127)|128,value>>>7);
}
export function writeU16(value){
  if(!Number.isInteger(value)||value<0||value>65535)throw new RangeError('u16 must be 0..65535');
  const out=new Uint8Array(2);new DataView(out.buffer).setUint16(0,value,true);return out;
}
export function writeU32(value){
  const out=new Uint8Array(4);new DataView(out.buffer).setUint32(0,value>>>0,true);return out;
}
export function concat(parts){
  const n=parts.reduce((s,p)=>s+p.length,0),out=new Uint8Array(n);let at=0;
  for(const p of parts){out.set(p,at);at+=p.length;}return out;
}
export function insert(bytes,offset,extra){
  extra=asBytes(extra);return extra.length?concat([bytes.slice(0,offset),extra,bytes.slice(offset)]):bytes;
}
export function patchCompactInPlace(bytes,offset,oldValue,newValue){
  const oldBytes=writeCompact(oldValue),newBytes=writeCompact(newValue);
  if(oldBytes.length!==newBytes.length)throw new Error(`compact field width change unsupported at ${offset}: ${oldValue} -> ${newValue}`);
  bytes.set(newBytes,offset);
}
export function cstringBytes(value){
  const s=String(value??'');
  if([...s].some(ch=>ch.charCodeAt(0)>255))throw new Error('Krieger strings must be byte strings');
  const out=new Uint8Array(s.length+1);for(let i=0;i<s.length;i++)out[i]=s.charCodeAt(i);return out;
}
