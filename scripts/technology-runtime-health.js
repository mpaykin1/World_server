#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),reg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/technology-registry.json'),'utf8'));
const result={generatedAt:new Date().toISOString(),technologies:{}};
for(const [name,t] of Object.entries(reg.technologies||{})){
 const evidence=(t.evidence||[]).map(p=>({path:p,exists:fs.existsSync(path.join(ROOT,p))}));
 let runnable=t.status==='production'||t.status==='integrated';
 if(t.status==='adapter') runnable=false;
 if(t.status==='not-production-integrated'||t.status==='not-server-runtime') runnable=false;
 result.technologies[name]={declaredPercent:t.percent,status:t.status,runnableByRepoEvidence:runnable,evidence};
}
fs.writeFileSync(path.join(ROOT,'TECHNOLOGY_RUNTIME_HEALTH.json'),JSON.stringify(result,null,2)+'\n');
console.log('[TECH_RUNTIME_HEALTH] report written');
