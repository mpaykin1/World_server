#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/technology-orchestrator.json'),'utf8'));
function which(name){const r=cp.spawnSync(process.platform==='win32'?'where':'which',[name],{encoding:'utf8'});return r.status===0?r.stdout.trim().split(/\r?\n/)[0]:null}
const engines={};
for(const [id,e] of Object.entries(cfg.engines||{})){
  let available=false,location=null,reason=null;
  if(e.kind==='binary'){
    const explicit=e.binEnv&&process.env[e.binEnv];
    location=explicit&&fs.existsSync(explicit)?explicit:null;
    if(!location)for(const n of e.names||[])if((location=which(n)))break;
    available=!!location;reason=available?'binary detected':'binary not detected';
  }else if(e.kind==='python-repo'){
    const h=e.homeEnv&&process.env[e.homeEnv];location=h||null;
    available=!!(h&&fs.existsSync(h));reason=available?'repo configured':'repo env not configured';
  }else if(e.kind==='external-or-branch'){
    location=e.endpointEnv&&process.env[e.endpointEnv]||null;available=!!location;reason=available?'remote endpoint configured':'branch may exist but no runtime endpoint';
  }else if(e.kind==='blender-addon'){
    const h=e.homeEnv&&process.env[e.homeEnv];location=h||null;available=!!(h&&fs.existsSync(h));reason=available?'addon configured':'addon not configured';
  }else if(e.kind==='env-json'){
    const raw=e.env&&process.env[e.env];location=e.env||null;
    try{const parsed=raw?JSON.parse(raw):[];available=Array.isArray(parsed)&&parsed.length>0;reason=available?'remote workers configured':'remote workers not configured'}catch{available=false;reason='invalid worker JSON'}
  }
  engines[id]={available,location,reason,adapter:e.serverAdapter||null};
}
const runnable=Object.values(engines).filter(x=>x.available).length,total=Object.keys(engines).length;
const report={generatedAt:new Date().toISOString(),runnable,total,coveragePercent:Math.round(runnable*100/Math.max(1,total)),engines};
fs.writeFileSync(path.join(ROOT,'TECHNOLOGY_ORCHESTRATOR_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[TECH_ORCHESTRATOR] runnable=${runnable}/${total}`);
