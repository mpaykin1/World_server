import { Worker } from 'node:worker_threads';
import os from 'node:os';
const workerCount=Math.max(2,Math.min(4,os.cpus().length));
const workers=[];let seq=0;const pending=new Map();
function send(w,msg,transfer=[]){return new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});w.postMessage({...msg,id},transfer);});}
for(let i=0;i<workerCount;i++){const w=new Worker(new URL('./wasm_simd_node_worker.mjs',import.meta.url),{workerData:{worker:i}});w.on('message',m=>{const p=pending.get(m.id);if(!p)return;pending.delete(m.id);m.ok?p.resolve(m):p.reject(new Error(m.error));});w.on('error',e=>{console.error(e);});workers.push(w);}
const probes=await Promise.all(workers.map((w,i)=>send(w,{op:'probe',i})));
const n=1_200_003,input=new Uint16Array(n);for(let i=0;i<n;i++)input[i]=(i*7919)%65536;const scale=0.0037,bias=-11.25;
const pieces=[];let s=0;for(let i=0;i<workers.length;i++){const e=Math.round((i+1)*n/workers.length),part=input.slice(s,e),buf=part.buffer;pieces.push(send(workers[i],{op:'dequant-u16',buffer:buf,scale,bias},[buf]));s=e;}
const rs=await Promise.all(pieces),out=new Float32Array(n);let o=0;for(const r of rs){const a=new Float32Array(r.buffer);out.set(a,o);o+=a.length;}
let maxError=0;for(let i=0;i<n;i++){const expected=Math.fround(Math.fround(input[i])*Math.fround(scale)+Math.fround(bias));maxError=Math.max(maxError,Math.abs(out[i]-expected));}
const bytes=new Uint8Array(1_000_013);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;const cp=await send(workers[0],{op:'copy-u8',buffer:bytes.slice().buffer},[]);const copied=new Uint8Array(cp.buffer);let copyPass=copied.length===bytes.length;for(let i=0;copyPass&&i<bytes.length;i++)copyPass=copied[i]===bytes[i];
for(const w of workers)await w.terminate();
const pass=probes.every(p=>p.simd)&&maxError<=2e-5&&copyPass&&workerCount>=2;
console.log(JSON.stringify({pass,mode:'node-worker-threads+wasm-simd128-v1',workers:workerCount,items:n,maxError,copyPass,sourceAssetModified:false},null,0));
process.exit(pass?0:1);
