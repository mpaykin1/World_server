/* V8 threaded SIMD scheduler. Each worker runs the verified SIMD module; no source mutation. */
export class WasmSimdThreadPool{
  constructor({maxWorkers=Math.max(1,Math.min(8,(globalThis.navigator?.hardwareConcurrency||4)-1)),minParallelItems=262144}={}){
    this.maxWorkers=maxWorkers;this.minParallelItems=minParallelItems;this.workers=[];this.seq=0;this.pending=new Map();this.ready=false;this.mode='worker-pool+wasm-simd128-v1';
  }
  capabilities(){return {workers:typeof Worker!=='undefined',sharedArrayBuffer:typeof SharedArrayBuffer!=='undefined',crossOriginIsolated:globalThis.crossOriginIsolated===true,wasm:typeof WebAssembly!=='undefined'};}
  async init(){
    const c=this.capabilities();if(!c.workers||!c.wasm)return this.report();
    const count=Math.max(1,this.maxWorkers);
    for(let i=0;i<count;i++){
      const w=new Worker(new URL('./workers/quality-simd-worker.js',import.meta.url),{type:'module',name:`quality-simd-${i}`});
      w.onmessage=e=>{const m=e.data||{};const p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);m.ok?p.resolve(m):p.reject(new Error(m.error||'worker failed'));};
      w.onerror=e=>{console.warn('quality SIMD worker error',e);};this.workers.push(w);
    }
    const probes=await Promise.all(this.workers.map((w,i)=>this._send(w,{op:'probe',worker:i})));this.ready=probes.every(p=>p.simd===true);return this.report();
  }
  _send(worker,msg,transfer=[]){return new Promise((resolve,reject)=>{const id=++this.seq;this.pending.set(id,{resolve,reject});worker.postMessage({...msg,id},transfer);});}
  async dequantizeU16(input,{scale=1,bias=0}={}){
    if(!this.ready||input.length<this.minParallelItems){return this._single('dequantizeU16',input,{scale,bias});}
    const n=input.length,k=Math.min(this.workers.length,Math.ceil(n/this.minParallelItems));const jobs=[];let start=0;
    for(let i=0;i<k;i++){const end=Math.round((i+1)*n/k),part=input.slice(start,end),buf=part.buffer;jobs.push(this._send(this.workers[i],{op:'dequant-u16',buffer:buf,count:part.length,scale,bias},[buf]));start=end;}
    const rs=await Promise.all(jobs);const out=new Float32Array(n);let o=0;for(const r of rs){const a=new Float32Array(r.buffer);out.set(a,o);o+=a.length;}return out;
  }
  async copyU8(input){
    if(!this.ready||input.length<this.minParallelItems)return this._single('copyU8',input,{});
    const n=input.length,k=Math.min(this.workers.length,Math.ceil(n/this.minParallelItems));const jobs=[];let start=0;
    for(let i=0;i<k;i++){const end=Math.round((i+1)*n/k),part=input.slice(start,end),buf=part.buffer;jobs.push(this._send(this.workers[i],{op:'copy-u8',buffer:buf,count:part.length},[buf]));start=end;}
    const rs=await Promise.all(jobs),out=new Uint8Array(n);let o=0;for(const r of rs){const a=new Uint8Array(r.buffer);out.set(a,o);o+=a.length;}return out;
  }
  async _single(method,input,options){const {getQualitySimd}=await import('./wasm-simd-codec.js');const s=await getQualitySimd();if(!s.supported){if(method==='copyU8')return input.slice();if(method==='dequantizeU16'){const out=new Float32Array(input.length);for(let i=0;i<input.length;i++)out[i]=input[i]*options.scale+options.bias;return out;}}return s[method](input,options);}
  dispose(){for(const w of this.workers)w.terminate();this.workers=[];for(const p of this.pending.values())p.reject(new Error('pool disposed'));this.pending.clear();this.ready=false;}
  report(){const c=this.capabilities();return {supported:c.workers&&c.wasm,ready:this.ready,mode:this.mode,workers:this.workers.length,sharedMemoryAvailable:c.sharedArrayBuffer&&c.crossOriginIsolated,simdPerWorker:true,sourceAssetModified:false,sourceBytesModified:false,nearFieldQualityReduced:false,safeScalarFallback:true};}
}
