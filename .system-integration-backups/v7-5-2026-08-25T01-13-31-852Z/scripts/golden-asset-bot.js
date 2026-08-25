#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),APPLY=process.argv.includes('--apply');
const rules=JSON.parse(fs.readFileSync(path.join(ROOT,'data/golden-asset-rules.json'),'utf8'));
const caps=JSON.parse(fs.readFileSync(path.join(ROOT,'data/app-capabilities.json'),'utf8'));
const jobs=[],blockers=[];
const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
for(const r of rules.rules||[]){
  if(r.status!=='golden'||!r.source){blockers.push({component:r.componentId,reason:'awaiting exact approved source'});continue;}
  const src=path.join(ROOT,r.source);
  if(!fs.existsSync(src)){blockers.push({component:r.componentId,reason:'source missing',source:r.source});continue;}
  const digest=sha(src);
  if(r.sha256&&r.sha256!==digest){blockers.push({component:r.componentId,reason:'source hash changed',expected:r.sha256,actual:digest});continue;}
  for(const [appId,a] of Object.entries(caps.apps||{})){
    if(a.capabilities?.[r.capability]!==true)continue;
    const dest=path.join(ROOT,'apps',appId,'golden-assets',path.basename(src));
    const adopted=fs.existsSync(dest)&&sha(dest)===digest;
    jobs.push({component:r.componentId,app:appId,source:r.source,dest:path.relative(ROOT,dest).replaceAll('\\','/'),adopted});
    if(APPLY&&!adopted){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);}
  }
}
fs.writeFileSync(path.join(ROOT,'GOLDEN_ASSET_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),mode:APPLY?'apply':'plan',jobs,blockers},null,2)+'\n');
console.log(`[GOLDEN_ASSET_BOT] jobs=${jobs.length} blockers=${blockers.length} mode=${APPLY?'apply':'plan'}`);
