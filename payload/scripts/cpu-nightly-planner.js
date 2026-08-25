#!/usr/bin/env node
'use strict';
const cp=require('child_process'),path=require('path'),fs=require('fs');const ROOT=process.cwd();
const steps=['cpu-quality-learner.js','quality-knowledge-learning.js','bayesian-quality-predictor.js','quality-invariant-miner.js','hardware-fingerprint.js','quality-self-calibration.js','autopilot-project-priority.js','project-quality-curriculum.js','adaptive-night-budget.js','autopilot-task-planner.js','cpu-budget-gate.js','cross-project-learning.js','incremental-test-selector.js'];
const results=[];
for(const f of steps){const r=cp.spawnSync(process.execPath,[path.join(ROOT,'scripts',f)],{cwd:ROOT,stdio:'inherit',env:process.env});results.push({file:f,status:r.status});if(r.status!==0){fs.writeFileSync(path.join(ROOT,'CPU_NIGHTLY_PLANNER_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),pass:false,results},null,2)+'\n');process.exit(r.status||1)}}
const out={generatedAt:new Date().toISOString(),pass:true,cpuOnly:true,gpu:false,paidCost:0,results};fs.writeFileSync(path.join(ROOT,'CPU_NIGHTLY_PLANNER_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log('[CPU_NIGHTLY_PLANNER] PASS');
