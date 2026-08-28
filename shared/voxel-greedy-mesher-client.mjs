export class GreedyMesherPool{
  constructor(url='/shared/voxel-greedy-mesher-worker.mjs',size=Math.max(1,Math.min(2,(navigator.hardwareConcurrency||4)-1))){
    this.url=url;this.available=typeof Worker!=='undefined';this.workers=[];this.queue=[];this.nextId=1;this.pending=new Map();
    if(this.available)for(let i=0;i<size;i++)this.#spawn();
  }
  #spawn(){
    const w=new Worker(this.url,{type:'module',name:'voxel-greedy-mesher'});w.busy=false;
    w.onmessage=e=>{const m=e.data||{},p=this.pending.get(m.id);if(!p)return;this.pending.delete(m.id);w.busy=false;m.ok?p.resolve(m.result):p.reject(new Error(m.error||'greedy mesher failed'));this.#pump();};
    w.onerror=e=>{w.busy=false;console.warn('[GreedyMesher]',e.message||e);this.#pump();};this.workers.push(w);
  }
  mesh({blocks,dims,colors,kinds}){
    if(!this.available)return Promise.reject(new Error('Worker unavailable'));
    return new Promise((resolve,reject)=>{const job={id:this.nextId++,blocks,dims,colors,kinds,resolve,reject};this.queue.push(job);this.#pump();});
  }
  #pump(){
    for(const w of this.workers){if(w.busy)continue;const j=this.queue.shift();if(!j)break;w.busy=true;this.pending.set(j.id,j);w.postMessage({id:j.id,blocks:j.blocks.buffer,dims:j.dims,colors:j.colors.buffer,kinds:j.kinds.buffer},[j.blocks.buffer]);}
  }
  stats(){return{available:this.available,workers:this.workers.length,queued:this.queue.length,pending:this.pending.size};}
  dispose(){for(const w of this.workers)w.terminate();this.workers=[];this.available=false;}
}
