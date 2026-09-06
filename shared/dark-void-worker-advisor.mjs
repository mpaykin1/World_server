import {buildWorldShape} from './world-shape-library.mjs';

export class WorkerPlanAdvisor{
  constructor(url='/shared/dark-void-plan-worker.js'){
    this.url=url;this.seq=0;this.pending=new Map();
    try{this.worker=new Worker(url,{type:'module'});this.worker.onmessage=e=>{const p=this.pending.get(e.data?.id);if(!p)return;this.pending.delete(e.data.id);e.data.ok?p.resolve(e.data):p.reject(new Error(e.data.error||'worker error'))}}
    catch{this.worker=null}
  }
  planSync(intent,options={}){return buildWorldShape(intent,options)}
  advise(intent,options={}){
    if(!this.worker){const blocks=this.planSync(intent,options);return Promise.resolve({ok:true,fallback:true,blocks,meta:{count:blocks.length}})}
    const id=++this.seq;return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.worker.postMessage({id,intent,options})})
  }
  dispose(){try{this.worker?.terminate?.()}finally{this.worker=null;this.pending.clear()}}
}
