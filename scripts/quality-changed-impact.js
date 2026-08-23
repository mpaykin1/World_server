#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
if(!fs.existsSync(path.join(ROOT,'QUALITY_IMPACT_GRAPH.json')))cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/quality-impact-graph.js')],{stdio:'inherit'});
const g=JSON.parse(fs.readFileSync(path.join(ROOT,'QUALITY_IMPACT_GRAPH.json'),'utf8'));
let changed=[];
if(process.env.QUALITY_CHANGED_FILES){
 changed=process.env.QUALITY_CHANGED_FILES.split(/[,\n]/).map(x=>x.trim()).filter(Boolean);
}else{
 let base=process.env.QUALITY_BASE_SHA;
 if(!base){
  const r=cp.spawnSync('git',['merge-base','HEAD','master'],{cwd:ROOT,encoding:'utf8'});
  if(r.status===0)base=r.stdout.trim();
 }
 if(base){
  const r=cp.spawnSync('git',['diff','--name-only',base,'HEAD'],{cwd:ROOT,encoding:'utf8'});
  if(r.status===0)changed=r.stdout.trim().split(/\r?\n/).filter(Boolean);
 }
}
const affected=new Set(),why=[];
function visit(node,seen=new Set()){
 if(seen.has(node))return;seen.add(node);
 for(const to of g.reverse?.[node]||[]){
  if(to.startsWith('app:'))affected.add(to.slice(4));
  why.push({from:node,to});
  visit(to,seen);
 }
}
for(const f of changed)visit(f);
for(const f of changed){
 const app=(f.match(/^apps\/([^/]+)/)||[])[1];
 if(app)affected.add(app);
}
const report={generatedAt:new Date().toISOString(),changed,affectedApps:[...affected].sort(),why};
fs.writeFileSync(path.join(ROOT,'QUALITY_CHANGE_IMPACT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[CHANGE_IMPACT] files=${changed.length} apps=${report.affectedApps.join(',')||'none'}`);
