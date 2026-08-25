#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd();
const load=p=>JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'));
const golden=load('data/golden-components.json'),caps=load('data/app-capabilities.json');
const adoptionsPath=path.join(ROOT,'data/golden-adoptions.json');
const adoptions=fs.existsSync(adoptionsPath)?JSON.parse(fs.readFileSync(adoptionsPath,'utf8')):{schemaVersion:'1.0.0',apps:{}};
const report={generatedAt:new Date().toISOString(),jobs:[],blockers:[],capabilityAuditNeeded:[]};

function sha256File(p){return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')}
function compatibleApps(component){
  const scope=component.scope||{};
  if(scope.allPlayableApps) return Object.entries(caps.apps||{}).filter(([,a])=>a.capabilities?.playable===true);
  if(scope.requiresCapability){
    const k=scope.requiresCapability;
    for(const [id,a] of Object.entries(caps.apps||{})){
      if(a.capabilities?.playable===true && a.capabilities?.[k]==='unknown') report.capabilityAuditNeeded.push({app:id,capability:k});
    }
    return Object.entries(caps.apps||{}).filter(([,a])=>a.capabilities?.[k]===true);
  }
  return [];
}

for(const [id,c] of Object.entries(golden.components||{})){
  if(c.status!=='golden')continue;
  const targets=compatibleApps(c);
  for(const [appId] of targets){
    adoptions.apps[appId]=adoptions.apps[appId]||{};
    const existing=adoptions.apps[appId][id];
    const canonical=String(c.canonical||'');
    const local=canonical && !/^[a-z]+:\/\//i.test(canonical) && !/^rbxassetid:/i.test(canonical);
    let digest=null;
    if(local){
      const source=path.join(ROOT,canonical);
      if(!fs.existsSync(source)){
        report.blockers.push({app:appId,component:id,reason:'canonical-local-source-missing',canonical});
        continue;
      }
      digest=sha256File(source);
    }
    if(existing?.canonical===canonical && (!digest||existing.sha256===digest)){
      report.jobs.push({app:appId,component:id,status:'already-adopted'});
      continue;
    }
    report.jobs.push({app:appId,component:id,status:'adoption-required',canonical,sha256:digest});
    report.blockers.push({app:appId,component:id,reason:'golden-adoption-required',canonical,sha256:digest});
  }
}

fs.writeFileSync(adoptionsPath,JSON.stringify(adoptions,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'GOLDEN_PROPAGATION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[GOLDEN_PROPAGATION] jobs=${report.jobs.length} blockers=${report.blockers.length} capabilityAuditNeeded=${report.capabilityAuditNeeded.length}`);
if(report.blockers.length)process.exitCode=3;
