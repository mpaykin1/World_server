#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/silent-cpu-autopilot-policy.json'),'utf8')),issues=[];
if(policy.hardConstraints?.gpuAllowed!==false)issues.push('gpuAllowed must be false');
if(policy.hardConstraints?.paidGpuAllowed!==false)issues.push('paidGpuAllowed must be false');
if(policy.hardConstraints?.paidComputeAllowed!==false)issues.push('paidComputeAllowed must be false');
if(Number(policy.costBudget?.paidComputeUnits)!==0)issues.push('paidComputeUnits must equal 0');
const plan=path.join(ROOT,'AUTOPILOT_TASK_PLAN.json');
if(fs.existsSync(plan)){const j=JSON.parse(fs.readFileSync(plan,'utf8'));for(const t of j.tasks||[]){if(t.requiresGpu===true)issues.push(`GPU task forbidden: ${t.projectKey}/${t.taskKind}`);if(Number(t.estimatedPaidCost||0)>0)issues.push(`paid task forbidden: ${t.projectKey}/${t.taskKind}`)}}
const report={generatedAt:new Date().toISOString(),pass:issues.length===0,cpuOnly:true,gpu:false,paidCompute:false,issues};fs.writeFileSync(path.join(ROOT,'CPU_ONLY_AUTOPILOT_POLICY_REPORT.json'),JSON.stringify(report,null,2)+'\n');for(const x of issues)console.error('[CPU_ONLY]',x);if(issues.length)process.exit(72);console.log('[CPU_ONLY] PASS: GPU=0 paid=0');
