#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),ep=path.join(ROOT,'data/error-prevention-registry.json');
const registry=JSON.parse(fs.readFileSync(ep,'utf8')),sources=['QUALITY_REGRESSION_REPORT.json','PROJECT_QUALITY_REVIEW.json','DUPLICATE_SYSTEM_REPORT.json','SYSTEM_CONTRACT_REPORT.json'];
registry.candidates=registry.candidates||[];
const known=new Set([...(registry.knownErrors||[]).map(e=>e.id),...registry.candidates.map(e=>e.id)]);
let added=0;
function stableId(src,obj){return 'auto-'+crypto.createHash('sha1').update(src+JSON.stringify(obj)).digest('hex').slice(0,12)}
for(const src of sources){
 const fp=path.join(ROOT,src);if(!fs.existsSync(fp))continue;
 const j=JSON.parse(fs.readFileSync(fp,'utf8'));
 const items=[...(j.violations||[]),...(j.findings||[])].filter(Boolean);
 for(const item of items){
  const severity=item.severity==='warning'?'warning':'release-blocker';
  if(severity==='warning')continue;
  const id=stableId(src,item);if(known.has(id))continue;
  registry.candidates.push({id,status:'candidate',severity:'release-blocker',sourceReport:src,detectedAt:new Date().toISOString(),details:item});
  known.add(id);added++;
 }
}
fs.writeFileSync(ep,JSON.stringify(registry,null,2)+'\n');
console.log(`[REGRESSION_CAPTURE] added=${added} candidates=${registry.candidates.length}`);
