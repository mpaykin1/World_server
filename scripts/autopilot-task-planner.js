#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');const ROOT=process.cwd();
const priority=JSON.parse(fs.readFileSync(path.join(ROOT,'AUTOPILOT_PROJECT_PRIORITY.json'),'utf8'));
const mem=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-improvement-memory.json'),'utf8'));
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/silent-cpu-autopilot-policy.json'),'utf8'));
const tasks=[];
const adaptive=fs.existsSync(path.join(ROOT,'ADAPTIVE_NIGHT_BUDGET.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'ADAPTIVE_NIGHT_BUDGET.json'),'utf8')):null;
const bayes=fs.existsSync(path.join(ROOT,'BAYESIAN_QUALITY_PREDICTION.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'BAYESIAN_QUALITY_PREDICTION.json'),'utf8')):{predictions:[]};
const actions=[
 {kind:'static_review',area:'code',cpu:60,impact:1.2},
 {kind:'regression_expand',area:'tests',cpu:90,impact:1.4},
 {kind:'incremental_test_plan',area:'tests',cpu:30,impact:.6},
 {kind:'cpu_genetic_optimize',area:'performance',cpu:240,impact:1.25},
 {kind:'asset_dedup',area:'assets',cpu:180,impact:.5},
 {kind:'asset_similarity_scan',area:'assets',cpu:240,impact:.55},
 {kind:'cpu_texture_optimize',area:'textures',cpu:300,impact:.9},
 {kind:'cpu_mesh_audit',area:'meshes',cpu:360,impact:1.0},
 {kind:'performance_tune',area:'performance',cpu:240,impact:1.1},
 {kind:'golden_adoption',area:'connectivity',cpu:120,impact:1.3},
 {kind:'root_cause_review',area:'quality',cpu:120,impact:1.0},
 {kind:'knowledge_learn',area:'learning',cpu:60,impact:.7}
];
for(const project of (priority.projects||[]).slice(0,policy.nightly.maxProjectsPerNight)){
  let count=0;
  for(const a of actions){
    const fp=crypto.createHash('sha1').update(JSON.stringify([project.projectKey,a.kind,a.area])).digest('hex').slice(0,16);
    const learned=(mem.items||[]).find(x=>x.fingerprint===fp);
    if(learned?.neverRetry)continue;
    const posterior=(bayes.predictions||[]).find(x=>x.fingerprint===fp);
    const success=Number(posterior?.posteriorSuccess??learned?.successProbability??.5),delta=Number(posterior?.posteriorDelta??learned?.averageDelta??0);
    const exploration=Number(posterior?.uncertainty??0)*.25;
    const expected=Math.max(0,a.impact+delta)*(.5+success)+exploration;
    const score=project.priority*expected/Math.max(30,a.cpu);
    tasks.push({projectKey:project.projectKey,taskKind:a.kind,systemArea:a.area,fingerprint:fp,priority:Math.round(score*1000)/1000,estimatedCpuSeconds:a.cpu,estimatedPaidCost:0,requiresGpu:false,expectedQualityDelta:Math.round(expected*100)/100,learnedSuccessProbability:success});
    count++;if(count>=policy.nightly.maxImprovementsPerProject)break;
  }
}
tasks.sort((a,b)=>b.priority-a.priority);
const maxSeconds=Number(adaptive?.maxCpuSeconds||policy.cpuBudget.maxCpuMinutesPerNight*60),selected=[];let used=0;
for(const t of tasks){if(selected.length>=policy.nightly.maxCandidatesPerNight)break;if(used+t.estimatedCpuSeconds>maxSeconds)continue;selected.push(t);used+=t.estimatedCpuSeconds}
fs.writeFileSync(path.join(ROOT,'AUTOPILOT_TASK_PLAN.json'),JSON.stringify({generatedAt:new Date().toISOString(),constraints:{gpu:false,paidCost:0,maxCpuSeconds:maxSeconds},estimatedCpuSeconds:used,tasks:selected},null,2)+'\n');
console.log(`[AUTOPILOT_PLAN] tasks=${selected.length} gpu=0 paid=0`);
