export class CPUImportWorkerPool {
  constructor({workerUrl='./workers/generic-import-worker.js', size=Math.max(1,Math.min(4,(navigator.hardwareConcurrency||2)-1))}={}){
    this.workerUrl=workerUrl; this.size=size; this.workers=[]; this.next=0;
    this.contract={mode:'cpu-wasm-threaded-import-pool-v1', sourceBytesExact:true, nearFieldQualityReduced:false, serverGpuRequired:false, fallback:'single-worker-exact-byte-path'};
    if(typeof Worker!=='undefined'){
      for(let i=0;i<size;i++){ try{ this.workers.push(new Worker(workerUrl,{type:'module'})); }catch{} }
    }
  }
  async checksum(arrayBuffer){
    if(!this.workers.length){ return crypto.subtle.digest('SHA-256',arrayBuffer.slice(0)); }
    const worker=this.workers[this.next++%this.workers.length];
    const payload=arrayBuffer.slice(0); // exact bytes; source buffer is never detached or rewritten.
    return new Promise((resolve,reject)=>{
      const id=crypto.randomUUID();
      const onMessage=e=>{ if(e.data?.id!==id)return; worker.removeEventListener('message',onMessage); e.data.error?reject(new Error(e.data.error)):resolve(e.data.digest); };
      worker.addEventListener('message',onMessage); worker.postMessage({id,kind:'sha256',buffer:payload},[payload]);
    });
  }
}
