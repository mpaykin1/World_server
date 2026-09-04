'use strict';
const fs=require('fs'),path=require('path'),{performance}=require('perf_hooks'),cf=require('../lib/creature-factory');
function makeAsset(i){const j=i%64;return{format:'zero-signal-procedural-asset-v1',category:cf.CATEGORIES[j%cf.CATEGORIES.length],params:{seed:'archetype-'+j,detail:1+(j%5)/10},materialSettings:{shaderPreset:j%3}};}
function pct(values,p){const x=[...values].sort((a,b)=>a-b);return x[Math.min(x.length-1,Math.max(0,Math.ceil(x.length*p)-1))]||0;}
const direct=[],optimized=[];let snapshot=null;
for(let round=0;round<5;round++){
 let t=performance.now();for(let i=0;i<5000;i++){cf.buildRecipe(makeAsset(i));cf.planCreatureQuality({distance:(i*17)%240,targetFps:60,mobile:i%5===0});}direct.push(performance.now()-t);
 const rt=cf.createCreatureRuntime({recipeCache:{maxEntries:256,maxBytes:8*1024*1024}});t=performance.now();for(let i=0;i<5000;i++)rt.plan(makeAsset(i),{distance:(i*17)%240,targetFps:60,mobile:i%5===0});optimized.push(performance.now()-t);snapshot=rt.snapshot();
}
const report={schemaVersion:'creature-runtime-engine-benchmark-v8',scenario:'5000 creatures / 64 shared procedural archetypes',generatedAt:new Date().toISOString(),direct:{medianMs:pct(direct,.5),p95Ms:pct(direct,.95)},optimized:{medianMs:pct(optimized,.5),p95Ms:pct(optimized,.95)},speedup:pct(direct,.5)/Math.max(.001,pct(optimized,.5)),cache:snapshot.recipeCache,telemetry:snapshot.telemetry,status:'PASS'};
if(report.optimized.p95Ms>1000||report.cache.hitRate<0.95||report.speedup<1.2)report.status='FAIL';const dir=path.resolve('.world-server','evidence');fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(path.join(dir,'creature-runtime-engine-v8.json'),JSON.stringify(report,null,2)+String.fromCharCode(10));console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exit(1);
