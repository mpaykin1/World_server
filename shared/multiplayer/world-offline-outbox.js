(function(global){'use strict';
class WorldOfflineOutbox{
  constructor({key='world.offline.outbox',max=100}={}){this.key=key;this.max=max}
  load(){try{return JSON.parse(localStorage.getItem(this.key)||'[]')}catch{return[]}}
  save(items){try{localStorage.setItem(this.key,JSON.stringify(items.slice(-this.max)))}catch{}}
  enqueue(item){const a=this.load();a.push({...item,queuedAt:Date.now()});this.save(a);return item}
  async flush(send){const a=this.load(),keep=[];let sent=0;for(const item of a){try{const ok=await send(item);if(ok)sent++;else keep.push(item)}catch{keep.push(item)}}this.save(keep);return{sent,remaining:keep.length}}
  size(){return this.load().length}
}
global.WorldOfflineOutbox=WorldOfflineOutbox;
})(globalThis);
