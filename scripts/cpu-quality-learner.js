#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const ROOT=process.cwd();
const modelPath=path.join(ROOT,'data/cpu-night-learning-model.json'),memPath=path.join(ROOT,'data/quality-improvement-memory.json');
const model=JSON.parse(fs.readFileSync(modelPath,'utf8')),memory=JSON.parse(fs.readFileSync(memPath,'utf8'));memory.items=memory.items||[];
const eventsPath=process.env.QUALITY_LEARNING_EVENTS_FILE||path.join(ROOT,'QUALITY_LEARNING_EVENTS.json');
const events=fs.existsSync(eventsPath)?(JSON.parse(fs.readFileSync(eventsPath,'utf8')).events||[]):[];

function fingerprint(e){return e.fingerprint||crypto.createHash('sha1').update(JSON.stringify([e.actionKind,e.systemArea,e.projectType,e.features||{}])).digest('hex').slice(0,16)}
for(const e of events){
  if(e.passedAllGates!==true&&e.passedAllGates!==false)continue;
  const fp=fingerprint(e);let m=memory.items.find(x=>x.fingerprint===fp);
  if(!m){m={fingerprint:fp,actionKind:e.actionKind||'unknown',systemArea:e.systemArea||'unknown',attempts:0,successes:0,failures:0,cumulativeDelta:0,averageDelta:0,neverRetry:false};memory.items.push(m)}
  m.attempts++;const d=Number(e.qualityDelta||0);m.cumulativeDelta+=d;m.averageDelta=m.cumulativeDelta/m.attempts;
  if(e.passedAllGates&&d>=0)m.successes++;else m.failures++;
  m.successProbability=(m.successes+Number(model.priors.successAlpha||1))/(m.attempts+Number(model.priors.successAlpha||1)+Number(model.priors.successBeta||1));
  if(m.failures>=3&&m.successes===0)m.neverRetry=true;
  if(m.averageDelta<-.25&&m.attempts>=2)m.neverRetry=true;
  m.updatedAt=new Date().toISOString();
}
memory.items.sort((a,b)=>(b.successProbability||0)*(b.averageDelta+1)-(a.successProbability||0)*(a.averageDelta+1));
fs.writeFileSync(memPath,JSON.stringify(memory,null,2)+'\n');
const report={generatedAt:new Date().toISOString(),eventsLearned:events.length,patterns:memory.items.length,neverRetry:memory.items.filter(x=>x.neverRetry).length,topPatterns:memory.items.filter(x=>!x.neverRetry).slice(0,20)};
fs.writeFileSync(path.join(ROOT,'CPU_NIGHT_LEARNING_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[CPU_LEARNER] events=${events.length} patterns=${report.patterns} blocked=${report.neverRetry}`);
