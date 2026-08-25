#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
function read(name,f={}){try{return JSON.parse(fs.readFileSync(path.join(ROOT,name),'utf8'))}catch(_){return f}}
function merge(a,b){const o={...(a||{})};for(const [k,v] of Object.entries(b||{}))o[k]=v&&typeof v==='object'&&!Array.isArray(v)?merge(o[k]||{},v):v;return o}
const learned=read('.quality-autopilot-state/learned-policy.json'),cfg=merge(read('data/quiet-quality-autopilot.json'),learned.configOverrides||{}),autopilot=read('QUIET_AUTOPILOT_REPORT.json'),canary=read('QUALITY_AB_CANARY_REPORT.json'),regional=read('QUALITY_MULTI_REGION_REPORT.json'),chaos=read('QUALITY_CHAOS_FAILOVER_REPORT.json'),autofix=read('AUTOFIX_REPORT.json'),proof=cfg.proof||{};
const applied=Array.isArray(autofix.changes)?autofix.changes.filter(c=>c.applied!==false).length:0,reasons=[];
if(autopilot.status!=='VERIFIED_IMPROVEMENT_READY_FOR_BROWSER_GATE')reasons.push(`autopilot status=${autopilot.status||'missing'}`);
if(Number(autopilot.verification?.score||0)<Number(proof.minimumVerificationScore||5))reasons.push('verification score below threshold');
if(proof.requireCanaryPass!==false&&canary.pass!==true)reasons.push('A/B canary did not pass');
if(proof.requireMultiRegionPass!==false&&(regional.available!==true||regional.pass!==true))reasons.push('multi-region proof unavailable or failed');
if(proof.requireChaosFailoverPass!==false&&chaos.pass!==true)reasons.push('chaos/failover proof did not pass');
if(applied<=0)reasons.push('no deterministic applied changes');
const perfWin=Number(canary.averageMedianWinPercent),meaningfulPerfWin=Number.isFinite(perfWin)&&perfWin>=Number(proof.minimumMeaningfulPerfWinPercent||1);
const report={generatedAt:new Date().toISOString(),pass:reasons.length===0,verificationScore:Number(autopilot.verification?.score||0),appliedChanges:applied,canaryPass:canary.pass===true,multiRegionPass:regional.pass===true&&regional.available===true,chaosFailoverPass:chaos.pass===true,averageMedianWinPercent:Number.isFinite(perfWin)?perfWin:null,meaningfulPerfWin,classification:reasons.length?'REJECT':(meaningfulPerfWin?'PROVEN_PERFORMANCE_IMPROVEMENT':'PROVEN_CORRECTNESS_WITH_NO_PERFORMANCE_REGRESSION'),reasons};
fs.writeFileSync(path.join(ROOT,'QUALITY_PROOF_GATE.json'),JSON.stringify(report,null,2)+'\n');console.log(`[QUALITY_PROOF] pass=${report.pass} class=${report.classification} score=${report.verificationScore} applied=${applied} regional=${report.multiRegionPass}`);if(!report.pass)process.exit(41);
