#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),r=JSON.parse(fs.readFileSync(path.join(ROOT,'data/technology-registry.json'),'utf8'));
const issues=[];
for(const [name,t] of Object.entries(r.technologies||{})){
  if(['production','integrated','adapter'].includes(t.status)){
    for(const ev of t.evidence||[]) if(!fs.existsSync(path.join(ROOT,ev))) issues.push({name,evidence:ev,status:t.status});
  }
}
fs.writeFileSync(path.join(ROOT,'TECHNOLOGY_AUDIT.json'),JSON.stringify({generatedAt:new Date().toISOString(),issues,technologies:r.technologies},null,2)+'\n');
if(issues.length){console.error('[TECH_AUDIT] missing evidence',issues);process.exit(5)}
console.log('[TECH_AUDIT] PASS');
