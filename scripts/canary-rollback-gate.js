#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/rollout-policy.json'),'utf8'));
const input=process.env.CANARY_METRICS_JSON || path.join(ROOT,'CANARY_METRICS.json');
const out=path.join(ROOT,'CANARY_ROLLBACK_REPORT.json');
const enforce=process.argv.includes('--enforce');

if(!fs.existsSync(input)){
  const r={schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_VERIFIED',decision:'HOLD',reason:'CANARY_METRICS.json missing'};
  fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
  console.log('[CANARY_ROLLBACK] HOLD no metrics');
  if(enforce) process.exitCode=48;
} else {
  const m=JSON.parse(fs.readFileSync(input,'utf8'));
  const checks=[
    ['crashRate',Number(m.crashRate||0)<=cfg.maxCrashRate,m.crashRate,cfg.maxCrashRate],
    ['errorRate',Number(m.errorRate||0)<=cfg.maxErrorRate,m.errorRate,cfg.maxErrorRate],
    ['p95LatencyMs',Number(m.p95LatencyMs||0)<=cfg.maxP95LatencyMs,m.p95LatencyMs,cfg.maxP95LatencyMs],
    ['fpsDropPercent',Number(m.fpsDropPercent||0)<=cfg.maxFpsDropPercent,m.fpsDropPercent,cfg.maxFpsDropPercent]
  ].map(([name,ok,actual,max])=>({name,ok:Boolean(ok),actual,max}));
  const bad=checks.filter(x=>!x.ok);
  const decision=bad.length?'ROLLBACK':(Number(m.sampleSize||0)>=cfg.minSampleSize?'PROMOTE':'HOLD');
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),status:'PASS',decision,checks,sampleSize:Number(m.sampleSize||0)};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(`[CANARY_ROLLBACK] ${decision}`);
  if(enforce && decision!=='PROMOTE') process.exitCode=48;
}
