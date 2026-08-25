#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return null}};
function route(integration=read('WORLD_GRAPHICS_TECHNOLOGY_INTEGRATION_REPORT.json'),cpu=read('WORLD_CPU_GRAPHICS_OPTIMIZATION_REPORT.json')){
  if(!integration)throw new Error('technology integration report missing');
  const routes=(integration.routes||[]).filter(x=>x.runtimeReady&&x.productionReady).map(x=>({technology:x.technology,priority:x.cpuSafe?'CPU_FIRST':'OPTIONAL_GPU',detail:x.detailAdapter,optimization:x.optimizationAdapter}));
  routes.sort((a,b)=>(a.priority==='CPU_FIRST'?-1:1)-(b.priority==='CPU_FIRST'?-1:1));
  const out={schemaVersion:'6.0.0',system:'WORLD_GRAPHICS_QUALITY_ROUTER',generatedAt:new Date().toISOString(),defaultPolicy:'CPU_FIRST_FREE_LOCAL',cpuReadiness:cpu?.readinessPercent??null,routes,gpuRoutesOptional:routes.filter(x=>x.priority==='OPTIONAL_GPU').map(x=>x.technology),hardGateReady:integration.hardGateReady};
  fs.writeFileSync(path.join(ROOT,'WORLD_GRAPHICS_QUALITY_ROUTING_REPORT.json'),JSON.stringify(out,null,2)+'\n');return out;
}
if(require.main===module){const o=route();console.log(`[GRAPHICS_ROUTER] routes=${o.routes.length} cpu=${o.routes.filter(x=>x.priority==='CPU_FIRST').length}`)}
module.exports={route};
