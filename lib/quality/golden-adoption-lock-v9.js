'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
function sha256Buffer(b){return crypto.createHash('sha256').update(b).digest('hex');}
function sha256File(p){return sha256Buffer(fs.readFileSync(p));}
function listFiles(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory()){if(!['node_modules','.git','.next','dist','build'].includes(e.name))listFiles(p,out);}else out.push(p);}return out;}
function componentsFromRegistry(reg){if(Array.isArray(reg))return reg;if(Array.isArray(reg.components))return reg.components;if(reg.components&&typeof reg.components==='object')return Object.entries(reg.components).map(([id,v])=>({id,...v}));if(reg.registry&&Array.isArray(reg.registry))return reg.registry;return [];}
function canonicalValue(c){const x=c.canonical??c.source??c.file??c.path??c.contract??c.canonicalFile??c.canonicalPath; if(x&&typeof x==='object')return x.file??x.path??x.contract??x.value??null;return x??null;}
function buildGoldenAdoptions(repoRoot,registryPath='data/golden-components.json'){
 const rp=path.join(repoRoot,registryPath);if(!fs.existsSync(rp))return {version:9,generatedAt:new Date().toISOString(),status:'no-registry',components:[]};
 const reg=JSON.parse(fs.readFileSync(rp,'utf8')), apps=listFiles(path.join(repoRoot,'apps'));
 const appHashes=new Map();
 const out=[];
 for(const c of componentsFromRegistry(reg)){
  const id=String(c.id??c.name??c.key??'unnamed');const status=String(c.status??'').toLowerCase();
  if(status&&status!=='golden')continue;
  const cv=canonicalValue(c);if(!cv){out.push({id,status:'awaiting-source',verified:false,adoptions:[]});continue;}
  const abs=path.resolve(repoRoot,String(cv));
  if(abs.startsWith(path.resolve(repoRoot)+path.sep)&&fs.existsSync(abs)&&fs.statSync(abs).isFile()){
   const hash=sha256File(abs),adoptions=[];
   for(const f of apps){let h=appHashes.get(f);if(!h){try{h=sha256File(f);appHashes.set(f,h);}catch{continue;}}if(h===hash)adoptions.push(path.relative(repoRoot,f).replaceAll('\\','/'));}
   out.push({id,type:'file',canonical:path.relative(repoRoot,abs).replaceAll('\\','/'),sha256:hash,verified:true,adoptions});
  } else {
   const contract=typeof cv==='string'?cv:JSON.stringify(cv);out.push({id,type:'contract',contractSha256:sha256Buffer(Buffer.from(contract)),verified:true,adoptions:[]});
  }
 }
 return {version:9,generatedAt:new Date().toISOString(),status:'ok',components:out};
}
function verifyGoldenAdoptions(repoRoot,lock){const drift=[];for(const c of lock.components||[]){if(c.type==='file'&&c.canonical){const p=path.join(repoRoot,c.canonical);if(!fs.existsSync(p))drift.push({id:c.id,reason:'canonical-missing'});else{const h=sha256File(p);if(h!==c.sha256)drift.push({id:c.id,reason:'hash-drift',expected:c.sha256,actual:h});}}}return {ok:drift.length===0,drift};}
module.exports={sha256File,buildGoldenAdoptions,verifyGoldenAdoptions};
