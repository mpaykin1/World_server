'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function stable(v){if(Array.isArray(v))return v.map(stable);if(v&&typeof v==='object'){const o={};for(const k of Object.keys(v).sort())o[k]=stable(v[k]);return o;}return v;}
function cacheKey(input){return crypto.createHash('sha256').update(JSON.stringify(stable(input))).digest('hex');}
class CpuArtifactCache{
  constructor(root,options={}){this.root=root;this.maxBytes=Number(options.maxBytes||1024*1024*1024);this.ttlMs=Number(options.ttlMs||7*864e5);fs.mkdirSync(root,{recursive:true});}
  file(key){return path.join(this.root,`${key}.json`);}
  get(input){const key=typeof input==='string'?input:cacheKey(input),f=this.file(key);if(!fs.existsSync(f))return {hit:false,key};try{const row=JSON.parse(fs.readFileSync(f,'utf8'));if(Date.now()-Date.parse(row.createdAt)>this.ttlMs){fs.rmSync(f,{force:true});return {hit:false,key,expired:true};}row.lastHitAt=new Date().toISOString();row.hitCount=(row.hitCount||0)+1;fs.writeFileSync(f,JSON.stringify(row));return {hit:true,key,value:row.value,meta:row};}catch{return {hit:false,key,corrupt:true};}}
  put(input,value,meta={}){const key=cacheKey(input),f=this.file(key),tmp=`${f}.${process.pid}.tmp`;const row={key,createdAt:new Date().toISOString(),lastHitAt:null,hitCount:0,inputHash:key,value,meta};fs.writeFileSync(tmp,JSON.stringify(row));fs.renameSync(tmp,f);this.evict();return {ok:true,key,file:f};}
  evict(){const files=fs.readdirSync(this.root).filter(x=>x.endsWith('.json')).map(n=>{const p=path.join(this.root,n),s=fs.statSync(p);return {p,size:s.size,mtime:s.mtimeMs};}).sort((a,b)=>a.mtime-b.mtime);let total=files.reduce((n,x)=>n+x.size,0),removed=0;for(const x of files){if(total<=this.maxBytes)break;fs.rmSync(x.p,{force:true});total-=x.size;removed++;}return {totalBytes:total,removed};}
}
module.exports={CpuArtifactCache,cacheKey,stable};
