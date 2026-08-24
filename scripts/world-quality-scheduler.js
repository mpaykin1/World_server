#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function read(p,f={}){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
const status=read('WORLD_QUALITY_AUTOPILOT_STATUS.json',{}),runtime=read('WORLD_RUNTIME_QUALITY_REPORT.json',{}),materials=read('WORLD_MATERIAL_SYNTHESIS_REPORT.json',{});
const tasks=[
 {id:'semantic-detail',gain:9,cpu:3,gpu:0,cacheable:true},
 {id:'pbr-profile-synthesis',gain:7,cpu:2,gpu:0,cacheable:true},
 {id:'visual-render-compare',gain:10,cpu:4,gpu:4,cacheable:false},
 {id:'mesh-lod',gain:7,cpu:5,gpu:0,cacheable:true},
 {id:'external-pbr-bake',gain:9,cpu:2,gpu:9,cacheable:true}
];
const routes=tasks.map(t=>{const score=t.gain/Math.max(1,t.cpu+t.gpu*.7);const route=t.gpu>=7?'remote-gpu-if-configured':t.cpu>=5?'cpu-worker':'local-ci';return{...t,efficiency:+score.toFixed(3),route,priority:score>=2?'high':score>=1?'medium':'low'}}).sort((a,b)=>b.efficiency-a.efficiency);
const report={schemaVersion:'4.0.0',system:'WORLD_QUALITY_COST_SCHEDULER',generatedAt:new Date().toISOString(),readiness:status.readinessPercent??null,runtimePercent:runtime.percent??null,materialProfiles:materials.profiles??null,routes,policy:'maximize perceptual gain per compute while never bypassing quality gates'};
fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_SCHEDULER_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[WORLD_QUALITY_SCHEDULER_V4] ${routes.length} task routes`);
