#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'data/visual-baselines.json'),'utf8'));
const missing=[],ok=[];
for(const b of manifest.approvedBaselines||[]){
 const fp=path.join(ROOT,b.path||'');
 if(!b.path||!fs.existsSync(fp))missing.push({id:b.id,path:b.path});else ok.push({id:b.id,path:b.path});
}
const report={generatedAt:new Date().toISOString(),approved:(manifest.approvedBaselines||[]).length,available:ok.length,missing};
fs.writeFileSync(path.join(ROOT,'VISUAL_BASELINE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[VISUAL_BASELINES] approved=${report.approved} available=${report.available} missing=${missing.length}`);
if(missing.length)process.exit(8);
