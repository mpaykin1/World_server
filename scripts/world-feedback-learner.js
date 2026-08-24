#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function read(p,f={}){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
const runtime=read('WORLD_RUNTIME_QUALITY_REPORT.json',{}),telemetry=read('data/world-quality-telemetry-export.json',{samples:[]}),samples=Array.isArray(telemetry.samples)?telemetry.samples:[];
const good=samples.filter(s=>(s.fps||0)>=45&&(s.errorCount||0)===0),bad=samples.filter(s=>(s.fps||0)<30||(s.errorCount||0)>0);
const recommendations=[];
if(bad.length>good.length)recommendations.push({action:'bias-lower-tier',reason:'telemetry pressure exceeds healthy sessions',confidence:Math.min(.95,.55+bad.length*.03)});
if(good.length>=Math.max(4,bad.length*2))recommendations.push({action:'allow-tier-upgrade-experiments',reason:'stable healthy telemetry majority',confidence:Math.min(.95,.6+good.length*.02)});
if(!samples.length)recommendations.push({action:'collect-production-telemetry',reason:'no exported production samples available',confidence:1});
const report={schemaVersion:'4.0.0',system:'WORLD_FEEDBACK_LEARNER',generatedAt:new Date().toISOString(),samples:samples.length,healthySamples:good.length,pressureSamples:bad.length,runtimeCapabilitiesPercent:runtime.percent??null,recommendations,automaticMutation:false,guard:'recommendations must pass candidate tournament + regression gates before any code/config mutation'};
fs.writeFileSync(path.join(ROOT,'WORLD_FEEDBACK_LEARNER_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[WORLD_FEEDBACK_LEARNER_V4] samples=${samples.length} recommendations=${recommendations.length}`);
