let singleton=null;

async function instantiate(url){
  const response=await fetch(url,{cache:'force-cache'});
  if(!response.ok)throw new Error(`WASM SIMD HTTP ${response.status}`);
  const bytes=await response.arrayBuffer();
  const {instance}=await WebAssembly.instantiate(bytes,{});
  const e=instance.exports;
  if(!e.memory||!e.dequant_u16_to_f32||!e.scale_bias_f32||!e.copy_u8)throw new Error('WASM SIMD exports missing');
  return instance;
}

export async function getQualitySimd(){
  if(singleton)return singleton;
  singleton=(async()=>{
    if(typeof WebAssembly==='undefined')return {supported:false,reason:'no-webassembly'};
    try{
      const instance=await instantiate(new URL('./wasm/quality-simd.wasm',import.meta.url));
      return new QualitySimd(instance);
    }catch(error){
      console.warn('quality SIMD unavailable; safe JS fallback remains active',error);
      return {supported:false,reason:String(error?.message||error)};
    }
  })();
  return singleton;
}

export class QualitySimd{
  constructor(instance){this.instance=instance;this.exports=instance.exports;this.memory=instance.exports.memory;this.supported=true;this.mode='wasm-simd128-v1';}
  _ensure(bytes){
    const page=65536,have=this.memory.buffer.byteLength;if(bytes<=have)return;
    const pages=Math.ceil((bytes-have)/page);this.memory.grow(pages);
  }
  dequantizeU16(input,{scale=1,bias=0}={}){
    const n=input.length,srcBytes=n*2,dstOff=(srcBytes+15)&~15,total=dstOff+n*4;this._ensure(total);
    new Uint16Array(this.memory.buffer,0,n).set(input);
    this.exports.dequant_u16_to_f32(0,dstOff,n,scale,bias);
    return new Float32Array(this.memory.buffer.slice(dstOff,dstOff+n*4));
  }
  scaleBiasF32(input,{scale=1,bias=0}={}){
    const n=input.length,total=n*4;this._ensure(total);new Float32Array(this.memory.buffer,0,n).set(input);
    this.exports.scale_bias_f32(0,n,scale,bias);
    return new Float32Array(this.memory.buffer.slice(0,total));
  }
  copyU8(input){
    const n=input.length,dst=(n+15)&~15,total=dst+n;this._ensure(total);new Uint8Array(this.memory.buffer,0,n).set(input);
    this.exports.copy_u8(0,dst,n);return new Uint8Array(this.memory.buffer.slice(dst,dst+n));
  }
  report(){return{supported:true,mode:this.mode,simd128:true,sourceAssetModified:false,nearFieldQualityReduced:false};}
}
