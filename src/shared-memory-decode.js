/* V8 shared-memory decode arena. Never required for correctness: if the deployment
 * is not cross-origin isolated, callers keep the proven transferable/fallback path. */
export function sharedMemoryCapability(){
  const sab=typeof SharedArrayBuffer!=='undefined';
  const isolated=globalThis.crossOriginIsolated===true || (typeof process!=='undefined'&&!!process.versions?.node);
  return {supported:sab&&isolated,sharedArrayBuffer:sab,crossOriginIsolated:isolated,failMode:'transferable-arraybuffer-fallback'};
}
export class SharedDecodeArena{
  constructor(byteLength,{requireIsolation=true}={}){
    if(!Number.isInteger(byteLength)||byteLength<=0)throw new Error('SharedDecodeArena byteLength must be positive integer');
    const cap=sharedMemoryCapability();
    this.shared=cap.supported;
    if(requireIsolation&&!this.shared)throw new Error('SharedArrayBuffer fast path requires cross-origin isolation');
    this.buffer=this.shared?new SharedArrayBuffer(byteLength):new ArrayBuffer(byteLength);
    this.byteLength=byteLength;this.offset=0;this.allocations=[];
  }
  allocate(TypedArray,count,label='unnamed'){
    const bytes=TypedArray.BYTES_PER_ELEMENT*count;
    const align=Math.max(TypedArray.BYTES_PER_ELEMENT,4);
    this.offset=Math.ceil(this.offset/align)*align;
    if(this.offset+bytes>this.byteLength)throw new Error(`SharedDecodeArena overflow for ${label}`);
    const view=new TypedArray(this.buffer,this.offset,count);
    this.allocations.push({label,byteOffset:this.offset,byteLength:bytes,type:TypedArray.name,count});
    this.offset+=bytes;return view;
  }
  report(){return {mode:'shared-memory-zero-copy-decode-arena-v1',shared:this.shared,zeroCopyWorkerMain:this.shared,byteLength:this.byteLength,usedBytes:this.offset,allocations:this.allocations.length,sourceQualityReduced:false};}
}
export function deploymentIsolationContract(){return {headers:{'Cross-Origin-Opener-Policy':'same-origin','Cross-Origin-Embedder-Policy':'require-corp','Cross-Origin-Resource-Policy':'same-origin'},fallbackRequired:true,qualityInvariant:'absence-of-isolation-may-reduce-throughput-never-fidelity'};}
