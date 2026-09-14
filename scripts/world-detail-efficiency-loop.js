#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const {evaluateCandidate,makeBaseline}=require('../lib/world-detail-efficiency-gate');
const ROOT=process.cwd(),policy=require('../data/world-detail-efficiency-policy.json');
const PLAYWRIGHT_CLI=require.resolve('@playwright/test/cli');
const STATE_DIR=path.join(ROOT,'.world-server-state'),BASELINE=path.join(STATE_DIR,'detail-efficiency-baseline.json'),REPORT=path.join(STATE_DIR,'detail-efficiency-last-run.json');
fs.mkdirSync(STATE_DIR,{recursive:true});
function read(p,f=null){try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return f}}
function runProfile(project){
  const hasSystemChrome=process.platform==='win32'&&['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'].some(fs.existsSync);
  const r=cp.spawnSync(process.execPath,[PLAYWRIGHT_CLI,'test','e2e/detail-efficiency.spec.js',`--project=${project}`],{cwd:ROOT,encoding:'utf8',timeout:180000,env:{...process.env,DETAIL_EFFICIENCY_RUN:'1',...(hasSystemChrome&&!process.env.PLAYWRIGHT_SYSTEM_CHANNEL?{PLAYWRIGHT_SYSTEM_CHANNEL:'chrome'}:{})}});
  const text=`${r.stdout||''}\n${r.stderr||''}`,matches=[...text.matchAll(/DETAIL_EFFICIENCY_METRIC:(\{[^\r\n]+\})/g)];
  let metric=null;for(const m of matches){try{metric=JSON.parse(m[1])}catch{}}
  return{project,ok:r.status===0&&!!metric,status:r.status,error:r.error?String(r.error):null,metric,stdout:(r.stdout||'').slice(-5000),stderr:(r.stderr||'').slice(-5000)};
}
const profileRuns=policy.profiles.map(runProfile),metrics=profileRuns.map(x=>x.metric).filter(Boolean),baseline=read(BASELINE,null);
let decision=evaluateCandidate(policy,baseline,metrics);const blockers=[];
for(const p of profileRuns)if(!p.ok)blockers.push(`runtime-profile-failed:${p.project}`);
if(blockers.length)decision={...decision,accepted:false,initializeBaseline:false,reasons:[...(decision.reasons||[]),...blockers]};
let outcome='REJECTED';
if(decision.initializeBaseline){fs.writeFileSync(BASELINE,JSON.stringify(makeBaseline(metrics,decision.environmentFingerprint),null,2)+'\n');outcome='BASELINE_INITIALIZED';}
else if(decision.accepted){fs.writeFileSync(BASELINE,JSON.stringify(makeBaseline(metrics,decision.environmentFingerprint),null,2)+'\n');outcome='PROMOTED';}
const report={schemaVersion:'1.0.0',system:'WORLD_DETAIL_EFFICIENCY_LOOP',generatedAt:new Date().toISOString(),principle:policy.principle,outcome,decision,metrics,aspirationalTargets:policy.aspirationalTargets,runtimeProfiles:profileRuns.map(({stdout,stderr,...x})=>x)};
fs.writeFileSync(REPORT,JSON.stringify(report,null,2)+'\n');console.log(`[WORLD_DETAIL_EFFICIENCY] ${outcome} detailGain=${decision.detailGain??'n/a'} reasons=${(decision.reasons||[]).join(',')||'none'}`);console.log(`[WORLD_DETAIL_EFFICIENCY] report=${path.relative(ROOT,REPORT)}`);process.exitCode=blockers.length?3:0;
