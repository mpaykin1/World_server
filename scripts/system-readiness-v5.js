#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd(),read=(p,f={})=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}},exists=p=>fs.existsSync(path.join(ROOT,p)),pkg=read('package.json',{scripts:{}}),fresh=(r,h=24)=>r?.generatedAt&&Date.now()-Date.parse(r.generatedAt)<=h*3600000;
const defs=[
 ['world-core',15,exists('scripts/world-quality-autopilot.js')&&exists('shared/world-quality-autopilot.js'),read('WORLD_QUALITY_AUTOPILOT_STATUS.json').hardGateReady===true],
 ['runtime-proof',10,exists('scripts/runtime-proof.js')&&!!pkg.scripts?.['runtime:proof'],(()=>{const r=read('RUNTIME_PROOF_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['runtime-quality',10,exists('scripts/world-runtime-quality-profiler.js'),Number(read('WORLD_RUNTIME_QUALITY_REPORT.json').percent||0)>=97],
 ['physical-devices',10,exists('scripts/world-device-provider-probe.js')&&exists('services/device-farm/runner.js'),(()=>{const r=read('REAL_DEVICE_RUNTIME_EVIDENCE.json');return fresh(r)&&r.status==='PASS'})()],
 ['gameplay-agent',8,exists('e2e/ai-gameplay-agent.spec.js'),(()=>{const r=read('AI_GAMEPLAY_AGENT_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['physics-guardian',8,exists('e2e/physics-guardian.spec.js'),(()=>{const r=read('PHYSICS_GUARDIAN_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['performance',7,exists('e2e/performance-telemetry.spec.js')&&exists('scripts/performance-budget-gate.js'),(()=>{const r=read('PERFORMANCE_BUDGET_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['semantic-textures',5,exists('services/semantic-texture-baker/bake.py'),(()=>{const r=read('SEMANTIC_TEXTURE_BAKER_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['webgpu-meshlets',4,exists('shared/quality/webgpu-meshlet-experiment.js'),(()=>{const r=read('WEBGPU_MESHLET_REPORT.json');return fresh(r)&&r.partitionVerified===true})()],
 ['multiplayer-swarm',5,exists('scripts/multiplayer-swarm.js'),(()=>{const r=read('MULTIPLAYER_SWARM_REPORT.json');return fresh(r)&&r.status==='PASS'&&r.mode==='true-multiplayer-adapter'})()],
 ['roblox-bridge',4,exists('services/roblox-test-bridge/runner.js'),(()=>{const r=read('ROBLOX_BRIDGE_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['cv-player',4,exists('scripts/cv-gameplay-agent.js'),(()=>{const r=read('CV_GAMEPLAY_AGENT_REPORT.json');return fresh(r)&&r.status==='PASS'})()],
 ['winner-pr-bot',4,exists('scripts/winner-only-pr-guard.js')&&exists('.github/workflows/winner-only-pr.yml'),false],
 ['canary-rollback',4,exists('scripts/canary-rollback-gate.js'),(()=>{const r=read('CANARY_ROLLBACK_REPORT.json');return fresh(r)&&['PROMOTE','ROLLBACK'].includes(r.decision)})()],
 ['feedback-loop',3,exists('scripts/world-telemetry-harvester.js')&&exists('scripts/world-feedback-learner.js'),Number(read('WORLD_FEEDBACK_LEARNER_REPORT.json').samples||0)>0],
 ['rootcause-autofix',3,exists('scripts/quality-root-cause.js')&&exists('scripts/quality-autofix.js')&&exists('scripts/quality-patch-tournament.js'),exists('QUALITY_ROOT_CAUSE_GRAPH.json')]
];
let tw=0,iw=0,vw=0;const systems=defs.map(([id,w,i,v])=>{tw+=w;if(i)iw+=w;if(v)vw+=w;return{id,weight:w,implemented:!!i,verified:!!v}});const required=['runtime:proof','quality:world:v5','quality:system:v5','quality:v5:repair','quality:texture-baker:smoke','quality:meshlets','quality:device:probe','quality:cv-player','quality:roblox-bridge','quality:swarm','quality:canary-rollback'],connected=required.filter(k=>!!pkg.scripts?.[k]).length;
const o={schemaVersion:'5.0.0',generatedAt:new Date().toISOString(),implementationPercent:Math.round(100*iw/tw),verifiedPercent:Math.round(100*vw/tw),connectivityPercent:Math.round(100*connected/required.length),systems,currentWorldStatus:read('WORLD_QUALITY_AUTOPILOT_STATUS.json',{}),rule:'Implementation and runtime verification are separate; NOT_CONFIGURED/NOT_VERIFIED never count as PASS.'};fs.writeFileSync(path.join(ROOT,'SYSTEM_READINESS_V5_REPORT.json'),JSON.stringify(o,null,2)+'\n');console.log(`[SYSTEM_READINESS_V5] implementation=${o.implementationPercent}% verified=${o.verifiedPercent}% connectivity=${o.connectivityPercent}%`);
