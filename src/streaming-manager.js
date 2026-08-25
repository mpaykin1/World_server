import * as THREE from 'three';

export class LosslessStreamingManager {
  constructor({manifest, root, loadChunk}){
    this.cfg=manifest.streaming;this.root=root;this.loadChunk=loadChunk;this.loaded=new Map();this.pending=new Set();this.queue=[];
    this.preloadRadius=this.cfg.preloadRadius??180;this.unloadRadius=Math.max(this.cfg.unloadRadius??260,this.preloadRadius*1.2);this.baseConcurrency=this.cfg.concurrency??2;this.concurrency=this.baseConcurrency;this.scheduleConcurrencyCap=Infinity;this.active=0;this.chunks=this.cfg.chunks||[];
    this.visibilityBudget=Infinity;this.predictSeconds=this.cfg.predictSeconds??1.2;this._lastPos=new THREE.Vector3();this._predicted=new THREE.Vector3();this._queueIds=new Set();this._loads=0;this._unloads=0;
  }
  setVisibilityRange(fogFar){if(Number.isFinite(fogFar)&&fogFar>0){this.visibilityBudget=fogFar;this.preloadRadius=Math.min(this.preloadRadius,fogFar*1.04);this.unloadRadius=Math.min(this.unloadRadius,Math.max(this.preloadRadius*1.1,fogFar*1.12));}}
  setConcurrencyCap(n){this.scheduleConcurrencyCap=Number.isFinite(n)?Math.max(1,Math.floor(n)):Infinity;this.concurrency=Math.min(this.concurrency,this.scheduleConcurrencyCap);this._pump();}
  setPerformanceLevel(level=0){
    // Network/decode concurrency is reduced under frame pressure. Already-visible source quality is untouched.
    this.concurrency=Math.min(this.scheduleConcurrencyCap,Math.max(1,this.baseConcurrency-Math.max(0,Math.min(2,level))));
    this._pump();
  }
  async bootstrap(position=new THREE.Vector3()){this.update(position,true);while(this.active||this.queue.length)await new Promise(r=>setTimeout(r,16));}
  update(position,bootstrap=false,velocity=null){
    this._predicted.copy(position);if(velocity?.isVector3)this._predicted.addScaledVector(velocity,this.predictSeconds);
    for(const c of this.chunks){
      const dNow=this._distanceToBounds(position,c.runtimeBounds),dPred=this._distanceToBounds(this._predicted,c.runtimeBounds),d=Math.min(dNow,dPred);
      if(d<=this.preloadRadius&&!this.loaded.has(c.id)&&!this.pending.has(c.id)&&!this._queueIds.has(c.id)){
        this.pending.add(c.id);this._queueIds.add(c.id);this.queue.push({c,priority:d});
      }
    }
    // Closest/predicted chunks always win; no FIFO stalls after a direction change.
    this.queue.sort((a,b)=>a.priority-b.priority);this._pump();
    if(!bootstrap){for(const [id,obj] of [...this.loaded]){const c=this.chunks.find(x=>x.id===id);if(c&&this._distanceToBounds(position,c.runtimeBounds)>this.unloadRadius){this.root.remove(obj);disposeObject(obj);this.loaded.delete(id);this._unloads++;}}}
    this._lastPos.copy(position);
  }
  _pump(){while(this.active<this.concurrency&&this.queue.length){const item=this.queue.shift(),c=item.c;this._queueIds.delete(c.id);this.active++;Promise.resolve(this.loadChunk(c)).then(obj=>{this.root.add(obj);this.loaded.set(c.id,obj);this._loads++;}).catch(e=>console.error('stream chunk',c.id,e)).finally(()=>{this.pending.delete(c.id);this.active--;this._pump();});}}
  _distanceToBounds(p,b){const mn=b.min,mx=b.max,dx=Math.max(mn[0]-p.x,0,p.x-mx[0]),dy=Math.max(mn[1]-p.y,0,p.y-mx[1]),dz=Math.max(mn[2]-p.z,0,p.z-mx[2]);return Math.hypot(dx,dy,dz);}
  report(){return{mode:'lossless-spatial-chunks-v8',loaded:this.loaded.size,total:this.chunks.length,pending:this.pending.size,lossless:true,preloadRadius:this.preloadRadius,unloadRadius:this.unloadRadius,visibilityBudget:Number.isFinite(this.visibilityBudget)?this.visibilityBudget:null,predictivePrefetch:true,nearestFirstQueue:true,concurrency:this.concurrency,loads:this._loads,unloads:this._unloads,sourceQualityReduced:false};}
}
function disposeObject(root){root.traverse?.(o=>{o.geometry?.dispose?.();if(Array.isArray(o.material))o.material.forEach(m=>m.dispose?.());else o.material?.dispose?.();});}
