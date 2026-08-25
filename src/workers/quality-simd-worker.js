import {getQualitySimd} from '../wasm-simd-codec.js';
self.onmessage=async(e)=>{
  const m=e.data||{},id=m.id;
  try{
    const s=await getQualitySimd();
    if(m.op==='probe'){self.postMessage({id,ok:true,simd:s.supported===true,mode:s.mode||'scalar-fallback'});return;}
    if(m.op==='dequant-u16'){
      const a=new Uint16Array(m.buffer,0,m.count),out=s.supported?s.dequantizeU16(a,{scale:m.scale,bias:m.bias}):Float32Array.from(a,x=>x*m.scale+m.bias);
      self.postMessage({id,ok:true,buffer:out.buffer},[out.buffer]);return;
    }
    if(m.op==='copy-u8'){
      const a=new Uint8Array(m.buffer,0,m.count),out=s.supported?s.copyU8(a):a.slice();self.postMessage({id,ok:true,buffer:out.buffer},[out.buffer]);return;
    }
    throw new Error(`unknown op ${m.op}`);
  }catch(error){self.postMessage({id,ok:false,error:String(error?.stack||error)});}
};
