#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),contracts=JSON.parse(fs.readFileSync(path.join(ROOT,'data/system-contracts.json'),'utf8'));
const findings=[];
function walk(dir,out=[]){if(!fs.existsSync(dir))return out;for(const e of fs.readdirSync(dir,{withFileTypes:true})){const a=path.join(dir,e.name);if(e.isDirectory())walk(a,out);else if(/\.(js|html|css)$/.test(e.name))out.push(a)}return out}
const files=walk(path.join(ROOT,'apps'));
for(const abs of files){
 const rel=path.relative(ROOT,abs).replaceAll('\\','/'),s=fs.readFileSync(abs,'utf8');
 for(const [system,c] of Object.entries(contracts.contracts||{})){
  for(const pattern of c.forbiddenPatterns||[]){
   if(s.includes(pattern)) findings.push({severity:'blocker',system,file:rel,pattern,reason:'known duplicate/obsolete implementation'});
  }
 }
}
// Heuristic duplicate detector: repeated long normalized movement/collision functions across app files.
function normalizedFunctions(src){
 const rx=/function\s+([A-Za-z0-9_$]+)\s*\([^)]*\)\s*\{([\s\S]{120,2500}?)\n\}/g;const out=[];let m;
 while((m=rx.exec(src))){const body=m[2].replace(/\/\/.*$/gm,'').replace(/\s+/g,' ').replace(/\b\d+(?:\.\d+)?\b/g,'#').trim();if(body.length>=120)out.push({name:m[1],body});}
 return out;
}
const seen=new Map();
for(const abs of files.filter(f=>f.endsWith('.js'))){
 const rel=path.relative(ROOT,abs).replaceAll('\\','/');
 for(const fn of normalizedFunctions(fs.readFileSync(abs,'utf8'))){
  const h=crypto.createHash('sha1').update(fn.body).digest('hex');
  const a=seen.get(h)||[];a.push({file:rel,name:fn.name});seen.set(h,a);
 }
}
for(const [hash,list] of seen) if(list.length>1) findings.push({severity:'warning',system:'duplicate-code',hash,occurrences:list});
const blockers=findings.filter(f=>f.severity==='blocker').length;
fs.writeFileSync(path.join(ROOT,'DUPLICATE_SYSTEM_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),blockers,findings},null,2)+'\n');
console.log(`[DUPLICATE_REVIEW] blockers=${blockers} findings=${findings.length}`);
if(blockers)process.exit(6);
