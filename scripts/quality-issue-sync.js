#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const reports=['QUALITY_REGRESSION_REPORT.json','PROJECT_QUALITY_REVIEW.json','PERFORMANCE_BUDGET_REPORT.json','REAL_DEVICE_REPORT.json'];
const issues=[];
for(const f of reports){
 const p=path.join(ROOT,f);if(!fs.existsSync(p))continue;
 const j=JSON.parse(fs.readFileSync(p,'utf8'));
 for(const x of [...(j.violations||[]),...(j.findings||[])])if(x)issues.push({source:f,details:x});
}
fs.writeFileSync(path.join(ROOT,'QUALITY_ISSUE_CANDIDATES.json'),JSON.stringify({generatedAt:new Date().toISOString(),issues},null,2)+'\n');
console.log(`[QUALITY_ISSUES] candidates=${issues.length}`);
