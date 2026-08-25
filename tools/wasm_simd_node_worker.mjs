import { parentPort, workerData } from 'node:worker_threads';
import { readFile } from 'node:fs/promises';
const bytes=await readFile(new URL('../src/wasm/quality-simd.wasm',import.meta.url));
const {instance}=await WebAssembly.instantiate(bytes,{});const e=instance.exports,mem=e.memory;
function ensure(bytes){const page=65536,have=mem.buffer.byteLength;if(bytes>have)mem.grow(Math.ceil((bytes-have)/page));}
parentPort.on('message',m=>{try{
  if(m.op==='probe'){parentPort.postMessage({id:m.id,ok:true,simd:!!e.dequant_u16_to_f32,worker:workerData?.worker});return;}
  if(m.op==='dequant-u16'){
    const input=new Uint16Array(m.buffer),n=input.length,src=n*2,dst=(src+15)&~15,total=dst+n*4;ensure(total);new Uint16Array(mem.buffer,0,n).set(input);e.dequant_u16_to_f32(0,dst,n,m.scale,m.bias);const out=new Float32Array(mem.buffer.slice(dst,dst+n*4));parentPort.postMessage({id:m.id,ok:true,buffer:out.buffer},[out.buffer]);return;
  }
  if(m.op==='copy-u8'){
    const input=new Uint8Array(m.buffer),n=input.length,dst=(n+15)&~15,total=dst+n;ensure(total);new Uint8Array(mem.buffer,0,n).set(input);e.copy_u8(0,dst,n);const out=new Uint8Array(mem.buffer.slice(dst,dst+n));parentPort.postMessage({id:m.id,ok:true,buffer:out.buffer},[out.buffer]);return;
  }
  throw new Error('unknown op');
}catch(error){parentPort.postMessage({id:m.id,ok:false,error:String(error?.stack||error)});}});
