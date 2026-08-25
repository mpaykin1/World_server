#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const mem=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-improvement-memory.json'),'utf8'));
const caps=JSON.parse(fs.readFileSync(path.join(ROOT,'data/app-capabilities.json'),'utf8'));
const recommendations=[];
const winners=(mem.items||[]).filter(x=>!x.neverRetry&&x.attempts>=1&&x.successes>0&&x.averageDelta>0).slice(0,50);
for(const w of winners){
 for(const [app,a] of Object.entries(caps.apps||{})){
   recommendations.push({sourceFingerprint:w.fingerprint,targetApp:app,actionKind:w.actionKind,systemArea:w.systemArea,expectedDelta:w.averageDelta,confidence:w.successProbability||.5,status:'candidate-transfer'});
 }
}
recommendations.sort((a,b)=>b.expectedDelta*b.confidence-a.expectedDelta*a.confidence);
fs.writeFileSync(path.join(ROOT,'CROSS_PROJECT_LEARNING_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),recommendations:recommendations.slice(0,100)},null,2)+'\n');
console.log(`[CROSS_PROJECT_LEARNING] recommendations=${Math.min(100,recommendations.length)}`);
