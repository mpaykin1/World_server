'use strict';
const crypto = require('crypto');

const DEFAULT_DIM = 768;
const DEFAULT_MODEL = 'gemini-embedding-2';

function clean(v){ return String(v ?? '').replace(/[\u0000-\u001F]/g,' ').replace(/\s+/g,' ').trim().slice(0,8000); }
function normalizeVector(values, dim=DEFAULT_DIM){
  const out = Array.from({length:dim},(_,i)=>Number(values?.[i]||0));
  let norm = Math.sqrt(out.reduce((s,x)=>s+x*x,0));
  if(!Number.isFinite(norm)||norm===0) return out.map(()=>0);
  return out.map(x=>x/norm);
}
function cosine(a,b){
  const n=Math.min(a?.length||0,b?.length||0); if(!n)return 0;
  let d=0,aa=0,bb=0; for(let i=0;i<n;i++){const x=Number(a[i]||0),y=Number(b[i]||0);d+=x*y;aa+=x*x;bb+=y*y}
  return aa&&bb?d/(Math.sqrt(aa)*Math.sqrt(bb)):0;
}
function tokenFeatures(text){
  const t=clean(text).toLowerCase(); const words=t.match(/[\p{L}\p{N}_-]+/gu)||[]; const feats=[];
  for(const w of words){feats.push('w:'+w); for(let i=0;i<Math.max(1,w.length-2);i++)feats.push('g:'+w.slice(i,i+3));}
  return feats;
}
function localEmbedding(text,dim=DEFAULT_DIM){
  const v=new Float64Array(dim); for(const f of tokenFeatures(text)){
    const h=crypto.createHash('sha256').update(f).digest(); const idx=h.readUInt32BE(0)%dim; const sign=(h[4]&1)?1:-1; v[idx]+=sign*(1+(h[5]%3)*0.25);
  }
  return normalizeVector(v,dim);
}
async function geminiEmbedding(text,{apiKey=process.env.GEMINI_API_KEY,model=process.env.WORLD_FEEDBACK_EMBEDDING_MODEL||DEFAULT_MODEL,dim=Number(process.env.WORLD_FEEDBACK_EMBEDDING_DIM||DEFAULT_DIM)}={}){
  if(!apiKey) return null;
  const body={model:`models/${model}`,content:{parts:[{text:`task: clustering | query: ${clean(text)}`} ]},outputDimensionality:dim};
  const r=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:embedContent`,{method:'POST',headers:{'content-type':'application/json','x-goog-api-key':apiKey},body:JSON.stringify(body)});
  if(!r.ok) throw new Error(`gemini embedding ${r.status}`);
  const b=await r.json(); const values=b?.embedding?.values||b?.embeddings?.[0]?.values;
  if(!Array.isArray(values)) throw new Error('gemini embedding missing values');
  return {provider:'gemini',model,dim,values:normalizeVector(values,dim)};
}
function semanticKey(category,centroid){
  const compact=Buffer.from(Float32Array.from((centroid||[]).slice(0,96)).buffer).toString('base64');
  return 'sem:'+crypto.createHash('sha256').update(String(category||'other')+'\0'+compact).digest('hex').slice(0,24);
}
function greedyCluster(items,{threshold=0.82}={}){
  const clusters=[];
  for(const item of items){
    let best=null,bestScore=-1;
    for(const c of clusters){ if(c.category!==item.category)continue; const s=cosine(item.embedding,c.centroid); if(s>bestScore){bestScore=s;best=c} }
    if(best&&bestScore>=threshold){
      best.items.push(item); const n=best.items.length; best.centroid=normalizeVector(best.centroid.map((x,i)=>(x*(n-1)+item.embedding[i])/n),best.centroid.length); best.maxSimilarity=Math.max(best.maxSimilarity||0,bestScore);
    } else clusters.push({category:item.category,items:[item],centroid:[...item.embedding],maxSimilarity:1});
  }
  return clusters.map(c=>({...c,key:semanticKey(c.category,c.centroid)}));
}
module.exports={DEFAULT_DIM,DEFAULT_MODEL,clean,normalizeVector,cosine,localEmbedding,geminiEmbedding,semanticKey,greedyCluster};
