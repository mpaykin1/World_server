#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process'),os=require('os'),crypto=require('crypto');
const ROOT=process.cwd(),N=Math.max(2,Math.min(Number(process.env.QUALITY_CPU_TOURNAMENT_CANDIDATES||3),5));
const model=process.env.QUALITY_CPU_MODEL,bin=process.env.QUALITY_LLAMA_CLI||'llama-cli';
const plan=fs.existsSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'),'utf8')):{tasks:[]},task=plan.tasks?.[0];
const out={generatedAt:new Date().toISOString(),cpuOnly:true,gpu:false,paid:false,status:'NOT_CONFIGURED',candidates:[],winner:null};
function save(){fs.writeFileSync(path.join(ROOT,'CPU_PATCH_TOURNAMENT_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log(`[CPU_PATCH_TOURNAMENT] ${out.status}`)}
if(!model||!fs.existsSync(model)||!task){out.reason=!task?'no improvement task':'local GGUF model missing';save();process.exit(0)}
const roles=['minimal fix','test-first fix','shared-system fix','performance-safe fix','simple conservative fix'];
for(let i=0;i<N;i++){
 const prompt=`Return ONLY a unified git diff for this task. No markdown. CPU-only project; no GPU/paid dependencies. Never weaken tests or quality gates.\nTASK:\n${JSON.stringify(task,null,2)}\nROLE:${roles[i]}`;
 const r=cp.spawnSync(bin,['-m',model,'-ngl','0','-t',String(Math.max(1,os.cpus().length-1)),'-c','8192','-n','2200','--temp',String(.08+i*.04),'-p',prompt],{cwd:ROOT,encoding:'utf8',timeout:1800000,maxBuffer:20*1024*1024});
 const diff=String(r.stdout||'').trim(),valid=r.status===0&&diff.startsWith('diff --git ')&&Buffer.byteLength(diff)<120000;
 const c={i,role:roles[i],valid,bytes:Buffer.byteLength(diff),sha256:crypto.createHash('sha256').update(diff).digest('hex'),score:valid?1000-Buffer.byteLength(diff)/1024:-1e9};
 if(valid){c.diff=diff;const check=cp.spawnSync('git',['apply','--check','-'],{cwd:ROOT,input:diff,encoding:'utf8'});c.applyCheck=check.status===0;if(!c.applyCheck)c.score=-1e9}
 out.candidates.push(c);
}
const good=out.candidates.filter(x=>x.valid&&x.applyCheck).sort((a,b)=>b.score-a.score);if(good.length){out.winner=good[0];out.status='WINNER_SELECTED_NOT_APPLIED';fs.writeFileSync(path.join(ROOT,'CPU_PATCH_WINNER.diff'),good[0].diff)}else out.status='NO_VALID_CANDIDATE';save();
