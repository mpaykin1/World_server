#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),load=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const reg=load('QUALITY_REGRESSION_REPORT.json'),review=load('PROJECT_QUALITY_REVIEW.json'),evidence=load('EVIDENCE_QUALITY_REPORT.json');
const eligible=reg.pass===true && review.pass===true && Number(evidence.overall)>=Number(reg.baselineOverall||0);
const proposal={
  generatedAt:new Date().toISOString(),
  eligible,
  evidenceOverall:evidence.overall,
  baselineOverall:reg.baselineOverall,
  blockers:[
    ...(reg.violations||[]),
    ...(review.findings||[]).filter(x=>x.severity==='blocker')
  ],
  action:eligible?'READY_FOR_EXPLICIT_BASELINE_ACCEPTANCE':'KEEP_CURRENT_BASELINE'
};
fs.writeFileSync(path.join(ROOT,'QUALITY_PROMOTION_CANDIDATE.json'),JSON.stringify(proposal,null,2)+'\n');
console.log(`[QUALITY_PROMOTER] ${proposal.action}`);
if(!eligible)process.exit(10);
