#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),c=JSON.parse(fs.readFileSync(path.join(ROOT,'data/system-contracts.json'),'utf8')),r=JSON.parse(fs.readFileSync(path.join(ROOT,'data/app-release-registry.json'),'utf8'));
const findings=[],adoption={};
const htmlFor=id=>path.join(ROOT,'apps',id,'index.html');
for(const [system,contract] of Object.entries(c.contracts||{})){
 adoption[system]={canonical:contract.canonical,apps:{}};
 for(const id of contract.requiredBy||[]){
  if(id==='all-public-apps')continue;
  const hp=htmlFor(id);
  if(!fs.existsSync(hp)){findings.push({severity:'blocker',system,app:id,reason:'required app missing'});continue;}
  const h=fs.readFileSync(hp,'utf8');
  let ok=true;
  if(system==='ui') ok=h.includes('/shared/golden-ui-shell.js');
  if(system==='collision') ok=h.includes('/shared/golden-physics.js');
  if(system==='input') ok=h.includes('/shared/golden-physics.js')||h.includes('/shared/ai3d-playable-runtime.js');
  adoption[system].apps[id]=ok;
  if(!ok)findings.push({severity:'blocker',system,app:id,reason:'canonical system not adopted'});
 }
}
for(const [id,a] of Object.entries(r.apps||{})){
 if(a.visible===true&&a.status!=='certified') findings.push({severity:'blocker',system:'release',app:id,reason:'visible app not certified'});
}
const blockers=findings.filter(x=>x.severity==='blocker').length;
fs.writeFileSync(path.join(ROOT,'SYSTEM_CONTRACT_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),blockers,adoption,findings},null,2)+'\n');
console.log(`[SYSTEM_CONTRACT] blockers=${blockers}`);
if(blockers)process.exit(7);
