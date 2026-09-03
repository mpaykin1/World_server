(function(global){'use strict';
class WorldFeedbackOutbox{
  constructor({key='world.feedback.outbox',max=100}={}){this.key=key;this.max=max;global.addEventListener?.('online',()=>this.flush().catch(()=>{}))}
  load(){try{return JSON.parse(localStorage.getItem(this.key)||'[]')}catch{return[]}}
  save(a){try{localStorage.setItem(this.key,JSON.stringify(a.slice(-this.max)))}catch{}}
  enqueue(payload){const a=this.load();a.push({...payload,queuedAt:Date.now()});this.save(a);return a.length}
  async send(payload){const r=await fetch('/api/feedback',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error(String(r.status));return r.json()}
  async flush(){const a=this.load(),keep=[];let sent=0;for(const x of a){try{await this.send(x);sent++}catch{keep.push(x)}}this.save(keep);return{sent,remaining:keep.length}}
}
global.WorldFeedbackOutbox=WorldFeedbackOutbox;
})(globalThis);
