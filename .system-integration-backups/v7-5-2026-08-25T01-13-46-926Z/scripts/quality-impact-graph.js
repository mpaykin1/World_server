#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const release=JSON.parse(fs.readFileSync(path.join(ROOT,'data/app-release-registry.json'),'utf8'));
const contracts=JSON.parse(fs.readFileSync(path.join(ROOT,'data/system-contracts.json'),'utf8'));
const caps=JSON.parse(fs.readFileSync(path.join(ROOT,'data/app-capabilities.json'),'utf8'));

const nodes=new Set(),edges=[];
const norm=x=>x.replaceAll('\\','/');
function addEdge(from,to,kind){nodes.add(from);nodes.add(to);edges.push({from,to,kind})}
function walk(dir,out=[]){
 if(!fs.existsSync(dir))return out;
 for(const e of fs.readdirSync(dir,{withFileTypes:true})){
  const a=path.join(dir,e.name);e.isDirectory()?walk(a,out):out.push(a);
 }return out;
}
for(const file of walk(path.join(ROOT,'apps')).filter(f=>/\.(html|js|css)$/.test(f))){
 const rel=norm(path.relative(ROOT,file));nodes.add(rel);
 const app=(rel.match(/^apps\/([^/]+)/)||[])[1];
 if(app)addEdge(rel,`app:${app}`,'belongs-to');
 const s=fs.readFileSync(file,'utf8');
 for(const m of s.matchAll(/(?:src|href)=["'](\/shared\/[^"']+)["']/g)){
   addEdge(m[1].slice(1),rel,'html-dependency');
 }
 for(const m of s.matchAll(/(?:require\(|from\s+|import\s*\()["']([^"']+)["']/g)){
   const q=m[1];
   if(!q.startsWith('.'))continue;
   const abs=path.resolve(path.dirname(file),q);
   const candidates=[abs,abs+'.js',path.join(abs,'index.js')];
   const hit=candidates.find(fs.existsSync);
   if(hit)addEdge(norm(path.relative(ROOT,hit)),rel,'module-dependency');
 }
}
for(const [system,c] of Object.entries(contracts.contracts||{})){
 for(const canonical of c.canonical||[]){
   for(const app of c.requiredBy||[]){
    if(app==='all-public-apps')continue;
    addEdge(canonical,`app:${app}`,`contract:${system}`);
   }
 }
}
for(const [id,a] of Object.entries(caps.apps||{})){
 for(const [cap,on] of Object.entries(a.capabilities||{})){
   if(on===true)addEdge(`capability:${cap}`,`app:${id}`,'capability');
 }
}
for(const [id,a] of Object.entries(release.apps||{})){
 addEdge(`release:${a.status}`,`app:${id}`,'release-status');
}

const reverse={};
for(const e of edges)(reverse[e.from]||(reverse[e.from]=[])).push(e.to);
const out={generatedAt:new Date().toISOString(),nodes:[...nodes].sort(),edges,reverse};
fs.writeFileSync(path.join(ROOT,'QUALITY_IMPACT_GRAPH.json'),JSON.stringify(out,null,2)+'\n');
console.log(`[IMPACT_GRAPH] nodes=${out.nodes.length} edges=${edges.length}`);
