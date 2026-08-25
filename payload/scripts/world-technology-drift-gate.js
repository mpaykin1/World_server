#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return null}};
function gate(tech=read('WORLD_GRAPHICS_TECHNOLOGY_REPORT.json'),integration=read('WORLD_GRAPHICS_TECHNOLOGY_INTEGRATION_REPORT.json')){
  if(!tech||!integration)throw new Error('technology scout/integration reports missing');
  const lock=read('data/world-graphics-technology-lock.json')||{technologies:[]};const previous=new Set(lock.technologies||[]),runtime=(tech.technologies||[]).filter(x=>x.runtimeReady).map(x=>x.id),newRuntime=runtime.filter(x=>!previous.has(x));
  const integrated=new Set((integration.routes||[]).filter(x=>x.productionReady).map(x=>x.technology));const unintegrated=newRuntime.filter(x=>!integrated.has(x));
  const out={schemaVersion:'6.0.0',system:'WORLD_GRAPHICS_TECHNOLOGY_DRIFT_GATE',generatedAt:new Date().toISOString(),runtimeTechnologies:runtime,newRuntimeTechnologies:newRuntime,unintegrated,pass:unintegrated.length===0,rule:'new graphics technology may not pass release until both detail and optimization adapters exist'};
  fs.writeFileSync(path.join(ROOT,'WORLD_GRAPHICS_TECHNOLOGY_DRIFT_REPORT.json'),JSON.stringify(out,null,2)+'\n');if(process.argv.includes('--accept-current')&&out.pass){fs.writeFileSync(path.join(ROOT,'data/world-graphics-technology-lock.json'),JSON.stringify({schemaVersion:'6.0.0',technologies:runtime,acceptedAt:new Date().toISOString()},null,2)+'\n')}
  return out;
}
if(require.main===module){const o=gate();console.log(`[TECH_DRIFT_GATE] ${o.pass?'PASS':'FAIL'} new=${o.newRuntimeTechnologies.length}`);if(!o.pass)process.exitCode=1}
module.exports={gate};
