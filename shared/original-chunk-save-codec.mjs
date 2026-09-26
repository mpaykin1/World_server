/** Original portable chunk save codec; no upstream code or game integration. */
const MAGIC=[87,83,67,72],VERSION=1,HEADER=24,MAX=262144;
const checkSize=size=>{
 if(!Array.isArray(size)||size.length!==3||size.some(n=>!Number.isSafeInteger(n)||n<1||n>256))throw new RangeError('size');
 const count=size[0]*size[1]*size[2];
 if(count>MAX)throw new RangeError('volume');
 return count;
};
const checkOrigin=origin=>{
 if(!Array.isArray(origin)||origin.length!==3||origin.some(n=>!Number.isInteger(n)||n< -2147483648||n>2147483647))throw new RangeError('origin');
};
export function encodeOriginalChunk({size,origin=[0,0,0],blocks}){
 const count=checkSize(size);checkOrigin(origin);
 if(!(blocks instanceof Uint16Array)||blocks.length!==count)throw new TypeError('blocks');
 const out=new Uint8Array(HEADER+count*2),view=new DataView(out.buffer);
 out.set(MAGIC);view.setUint8(4,VERSION);view.setUint8(5,0);
 size.forEach((n,i)=>view.setUint16(6+i*2,n,true));
 origin.forEach((n,i)=>view.setInt32(12+i*4,n,true));
 for(let i=0;i<count;i++)view.setUint16(HEADER+i*2,blocks[i],true);
 return out;
}
export function decodeOriginalChunk(bytes){
 if(!(bytes instanceof Uint8Array)||bytes.byteLength<24)throw new TypeError('bytes');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(MAGIC.some((n,i)=>bytes[i]!==n))throw new Error('invalid magic');
 if(view.getUint8(4)!==VERSION||view.getUint8(5)!==0)throw new Error('unsupported version or flags');
 const size=[0,1,2].map(i=>view.getUint16(6+i*2,true)),count=checkSize(size);
 const origin=[0,1,2].map(i=>view.getInt32(12+i*4,true));
 if(bytes.byteLength!==24+count*2)throw new RangeError('payload length');
 const blocks=new Uint16Array(count);
 for(let i=0;i<count;i++)blocks[i]=view.getUint16(24+i*2,true);
 return {version:VERSION,size,origin,blocks};
}
