/** Optional browser-side CPU mesh worker controller. Never touches the renderer. */
export function createVoxelMeshWorkerClient(worker,{maxPending=32}={}) {
 if(!worker||typeof worker.postMessage!=='function'||typeof worker.addEventListener!=='function') throw new TypeError('worker');
 if(!Number.isSafeInteger(maxPending)||maxPending<1||maxPending>1024) throw new RangeError('maxPending');
 const pending=new Map(),revisions=new Map();
 let serial=0,disposed=false;
 const onMessage=event=>{
   const msg=event.data??{},entry=pending.get(msg.requestId);
   if(!entry)return;
   pending.delete(msg.requestId);
   if(disposed||revisions.get(entry.id)!==entry.revision)return entry.reject(new Error('stale mesh'));
   if(msg.error)return entry.reject(new Error(String(msg.error)));
   entry.resolve(msg);
 };
 const onError=event=>{
   for(const entry of pending.values())entry.reject(new Error(String(event?.message??'worker error')));
   pending.clear();
 };
 worker.addEventListener('message',onMessage);
 worker.addEventListener('error',onError);
 return Object.freeze({
   request(id,revision,snapshot){
     if(disposed)return Promise.reject(new Error('disposed'));
     if(typeof id!=='string'||!Number.isSafeInteger(revision)||revision<0||
       !snapshot||!(snapshot.blocks instanceof Uint16Array))
       return Promise.reject(new TypeError('request'));
     const last=revisions.get(id);
     if(last!==undefined&&revision<=last)return Promise.reject(new Error('stale revision'));
     if(pending.size>=maxPending)return Promise.reject(new Error('worker queue full'));
     revisions.set(id,revision);
     for(const [key,entry] of pending)if(entry.id===id){
       pending.delete(key);entry.reject(new Error('superseded mesh'));
     }
     const requestId=++serial;
     return new Promise((resolve,reject)=>{
       pending.set(requestId,{id,revision,resolve,reject});
       try{worker.postMessage({...snapshot,requestId},[snapshot.blocks.buffer]);}
       catch(error){pending.delete(requestId);reject(error);}
     });
   },
   invalidate(id){
     revisions.delete(id);
     for(const [key,entry] of pending)if(entry.id===id){
       pending.delete(key);entry.reject(new Error('invalidated mesh'));
     }
   },
   dispose(){
     if(disposed)return;disposed=true;
     worker.removeEventListener?.('message',onMessage);
     worker.removeEventListener?.('error',onError);
     for(const entry of pending.values())entry.reject(new Error('disposed'));
     pending.clear();revisions.clear();
     worker.terminate?.();
   },
   get pending(){return pending.size;}
 });
}
