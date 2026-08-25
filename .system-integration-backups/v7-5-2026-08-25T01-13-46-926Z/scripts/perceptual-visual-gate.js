#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),m=JSON.parse(fs.readFileSync(path.join(ROOT,'data/visual-baselines.json'),'utf8'));
const issues=[];
for(const b of m.approvedBaselines||[]){
 const f=path.join(ROOT,b.path||'');
 if(!fs.existsSync(f)){issues.push({id:b.id,reason:'baseline missing'});continue}
 const sha=crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
 if(b.sha256&&sha!==b.sha256)issues.push({id:b.id,reason:'baseline hash changed',expected:b.sha256,actual:sha});
}
const report={generatedAt:new Date().toISOString(),approved:(m.approvedBaselines||[]).length,issues,pass:issues.length===0};
fs.writeFileSync(path.join(ROOT,'VISUAL_PERCEPTUAL_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[VISUAL_PERCEPTUAL] approved=${report.approved} issues=${issues.length}`);
if(issues.length)process.exit(36);
