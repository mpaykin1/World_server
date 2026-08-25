#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os');const ROOT=process.cwd(),policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/silent-cpu-autopilot-policy.json'),'utf8')),plan=JSON.parse(fs.readFileSync(path.join(ROOT,'AUTOPILOT_TASK_PLAN.json'),'utf8'));
const bad=(plan.tasks||[]).filter(t=>t.requiresGpu||Number(t.estimatedPaidCost||0)>0);
const adaptive=fs.existsSync(path.join(ROOT,'ADAPTIVE_NIGHT_BUDGET.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'ADAPTIVE_NIGHT_BUDGET.json'),'utf8')):null;const cpuSeconds=(plan.tasks||[]).reduce((a,t)=>a+Number(t.estimatedCpuSeconds||0),0),max=Number(adaptive?.maxCpuSeconds||policy.cpuBudget.maxCpuMinutesPerNight*60);
const issues=[];if(bad.length)issues.push({type:'forbidden_gpu_or_paid_task',count:bad.length});if(cpuSeconds>max)issues.push({type:'cpu_budget_exceeded',cpuSeconds,max});
const out={generatedAt:new Date().toISOString(),pass:issues.length===0,cpuSeconds,maxCpuSeconds:max,logicalCpus:os.cpus().length,issues};
fs.writeFileSync(path.join(ROOT,'CPU_BUDGET_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log(`[CPU_BUDGET] pass=${out.pass} cpu=${cpuSeconds}/${max}`);if(!out.pass)process.exit(71);
