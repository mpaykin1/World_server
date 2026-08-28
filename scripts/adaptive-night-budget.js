#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os');const ROOT=process.cwd(),p=JSON.parse(fs.readFileSync(path.join(ROOT,'data/adaptive-night-budget-policy.json'),'utf8'));
const cores=Math.max(1,os.cpus().length),ratio=(os.loadavg()[0]||0)/cores;let minutes=p.baseCpuMinutes,mode='normal';
if(ratio>=p.busyLoadRatio){minutes=Math.max(p.minCpuMinutes,Math.round(minutes*.35));mode='busy'}
else if(ratio<=p.idleLoadRatio){minutes=Math.min(p.maxCpuMinutes,Math.round(minutes*1.35));mode='idle'}
const last=fs.existsSync(path.join(ROOT,'CPU_NIGHT_AUTOPILOT_REPORT.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'CPU_NIGHT_AUTOPILOT_REPORT.json'),'utf8')):null;
const calibration=fs.existsSync(path.join(ROOT,'SELF_CALIBRATION_REPORT.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'SELF_CALIBRATION_REPORT.json'),'utf8')):null;
if(calibration?.candidate?.budgetFactor){minutes=Math.max(p.minCpuMinutes,Math.min(p.maxCpuMinutes,Math.round(minutes*Number(calibration.candidate.budgetFactor))));mode+='-calibrated'}
if(last&&Number(last.tasksPlanned||0)>0&&Number(last.neverRetry||0)>Number(last.tasksPlanned||0)*.3){minutes=Math.max(p.minCpuMinutes,Math.round(minutes*.8));mode+='-conservative'}
const out={generatedAt:new Date().toISOString(),mode,loadRatio:ratio,cpuMinutes:minutes,maxCpuSeconds:minutes*60,maxParallelHeavy:1,maxParallelLight:ratio<p.idleLoadRatio?2:1,gpu:false,paidCost:0};
fs.writeFileSync(path.join(ROOT,'ADAPTIVE_NIGHT_BUDGET.json'),JSON.stringify(out,null,2)+'\n');console.log(`[ADAPTIVE_BUDGET] ${mode} ${minutes}min load=${ratio.toFixed(2)}`);
