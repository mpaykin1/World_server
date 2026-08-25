#!/usr/bin/env node
'use strict';
const fs=require('fs'), path=require('path');
const ROOT=process.cwd(), DATA=path.join(ROOT,'data');
const score=JSON.parse(fs.readFileSync(path.join(DATA,'quality-scorecard.json'),'utf8'));
const errors=JSON.parse(fs.readFileSync(path.join(DATA,'error-prevention-registry.json'),'utf8'));
const golden=JSON.parse(fs.readFileSync(path.join(DATA,'golden-components.json'),'utf8'));
const metrics=Object.entries(score.metrics||{});
const overall=metrics.length?Math.round(metrics.reduce((n,[,m])=>n+Number(m.percent||0),0)/metrics.length):0;
const blockers=[];
for(const [id,m] of metrics) if(Number(m.percent||0)<100) blockers.push({type:'metric',id,label:m.label,percent:m.percent,blockers:m.blockers||[]});
for(const e of errors.knownErrors||[]) if(e.severity==='release-blocker'&&e.status!=='protected') blockers.push({type:'known-error',id:e.id,status:e.status,category:e.category});
for(const [id,c] of Object.entries(golden.components||{})) if(c.status==='golden'&&!c.canonical) blockers.push({type:'golden-component',id,reason:'missing canonical source'});
const report={generatedAt:new Date().toISOString(),overallPercent:overall,releaseEligible:blockers.length===0,metrics:score.metrics,technologyUsage:score.technologyUsage||{},blockerCount:blockers.length,blockers};
fs.writeFileSync(path.join(ROOT,'QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[QUALITY_GOVERNANCE] overall=${overall}% blockers=${blockers.length} releaseEligible=${report.releaseEligible}`);
