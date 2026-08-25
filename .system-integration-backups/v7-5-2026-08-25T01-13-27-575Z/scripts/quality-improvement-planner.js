#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),load=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const b=load('QUALITY_GROWTH_BACKLOG.json');
const tasks=(b.backlog||[]).slice(0,25).map((x,i)=>({
  rank:i+1,
  id:`QG-${String(i+1).padStart(3,'0')}`,
  title:x.type==='technology-growth'?`Integrate ${x.technology}`:
        x.type==='golden-promotion-gap'?`Promote Golden ${x.component}`:
        `Improve ${x.metric}: ${x.controlId}`,
  reason:x,
  acceptanceCriteria:[
    'No existing metric decreases',
    'Relevant behavioral/static test passes',
    'QUALITY_REGRESSION_REPORT passes',
    'PROJECT_QUALITY_REVIEW has zero blockers',
    'Evidence record is added before score increases'
  ],
  status:'planned'
}));
const out={generatedAt:new Date().toISOString(),tasks};
fs.writeFileSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'),JSON.stringify(out,null,2)+'\n');
let md='| # | Задача | Приоритет | Статус |\n|---:|---|---:|---|\n';
for(const t of tasks)md+=`| ${t.rank} | ${t.title} | ${t.reason.priority??'-'} | ${t.status} |\n`;
fs.writeFileSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.md'),md);
console.log(`[QUALITY_PLAN] tasks=${tasks.length}`);
