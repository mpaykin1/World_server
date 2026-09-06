const JKEY='darkVoidRecipeJournal:v3',UKEY='darkVoidUnderstanding:v1';
const enc=typeof TextEncoder!=='undefined'?new TextEncoder():null;
const b=v=>enc?enc.encode(JSON.stringify(v)).length:JSON.stringify(v).length;
export function hash32(text=''){let h=2166136261>>>0;for(const ch of String(text)){h^=ch.codePointAt(0);h=Math.imul(h,16777619)>>>0}return h>>>0}
export class RecipeJournal{
 constructor(){this.rows=this.#load()}
 #load(){try{return JSON.parse(localStorage.getItem(JKEY)||'[]')}catch{return[]}}
 #save(){try{localStorage.setItem(JKEY,JSON.stringify(this.rows.slice(-512)))}catch{}}
 append(plan,meta={}){const prev=this.rows.at(-1)?.hash||'genesis';const row={step:this.rows.length,id:plan.id,intent:plan.intent,origin:plan.origin,blocks:plan.blocks?.length||0,meta,prevHash:prev};row.hash=hash32(prev+'|'+JSON.stringify(row));this.rows.push(row);this.#save();return row}
 verify(){let prev='genesis';for(const r of this.rows){const x={...r};delete x.hash;const h=hash32(prev+'|'+JSON.stringify(x));if(h!==r.hash||r.prevHash!==prev)return false;prev=r.hash}return true}
 bytes(){return b(this.rows)} replay(){return this.rows.map(r=>({intent:r.intent,origin:r.origin,expectedBlocks:r.blocks,hash:r.hash}))}
}
export class SurpriseEngine{
 constructor(){this.seen=new Set()}
 choose(step,tier){const bank=[['H1','Make the same recipe twice and compare it.'],['H1','Make a huge object from one tiny sentence.'],['H2','Repeat one simple shape rule three times.'],['H2','Grow a pattern, then grow it again at a larger scale.'],['H3','Predict what happens if we make the next object 30% bigger.'],['H3','Predict what happens if we change only the object type.']];for(let i=0;i<bank.length;i++){const x=bank[(step+tier+i)%bank.length],k=x.join('|');if(!this.seen.has(k)){this.seen.add(k);return{principle:x[0],prompt:x[1]}}}this.seen.clear();return this.choose(step,tier)}
}
export class AdaptiveTeacher{
 constructor(){try{this.score=Math.max(0,Math.min(1,Number(localStorage.getItem(UKEY)||.5)))}catch{this.score=.5}}
 observe(text=''){const s=String(text).toLowerCase();if(/\b(why|how|confused|what does|don't understand)\b/.test(s))this.score=Math.max(0,this.score-.08);else if(/\b(so|because|means|i think|predict)\b/.test(s))this.score=Math.min(1,this.score+.05);try{localStorage.setItem(UKEY,String(this.score))}catch{}return this.score}
 style(){return this.score<.35?'very-simple':this.score>.75?'deeper':'simple'}
}
export function telemetry(name,props={}){try{globalThis.posthog?.capture?.(name,props)}catch{}try{globalThis.Sentry?.addBreadcrumb?.({category:'dark-void-science',message:name,data:props})}catch{}}
export class RecipeStreamer{
 constructor({manifestation,maxResidentChunks=8}={}){this.manifestation=manifestation;this.maxResidentChunks=maxResidentChunks;this.archived=[]}
 compact(){const m=this.manifestation;if(!m?._chunks||m._chunks.length<=this.maxResidentChunks)return{archived:0,resident:m?._chunks?.length||0};const extra=m._chunks.length-this.maxResidentChunks;for(let i=0;i<extra;i++){const c=m._chunks[i];if(!c?.mesh?.visible)continue;c.mesh.visible=false;this.archived.push({chunk:i,reason:'distance-budget',recipeCount:m._creationIndex});}return{archived:extra,resident:this.maxResidentChunks,total:m._chunks.length}}
 rematerializeNear(){for(const a of this.archived.splice(0)){const c=this.manifestation?._chunks?.[a.chunk];if(c?.mesh)c.mesh.visible=true}return true}
}
