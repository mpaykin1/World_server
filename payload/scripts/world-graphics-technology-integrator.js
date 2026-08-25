#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return null}};
function integrate(report=read('WORLD_GRAPHICS_TECHNOLOGY_REPORT.json'),registry=read('data/world-graphics-technology-adapters.json')){
  if(!report)throw new Error('Run quality:world:tech-scout first');if(!registry)throw new Error('Missing technology adapter registry');
  const adapters=registry.adapters||{},routes=[],blockers=[];
  for(const tech of report.technologies||[]){
    let a=adapters[tech.id];
    if(!a && String(tech.id).startsWith('package:')){
      a={detail:['capability-review-required'],optimization:['budget-profile-first'],generic:true};
    }
    const detail=Array.isArray(a?.detail)&&a.detail.length>0,optimization=Array.isArray(a?.optimization)&&a.optimization.length>0;
    const productionReady=!!a&&!a.generic&&detail&&optimization;
    const route={technology:tech.id,status:tech.status,runtimeReady:!!tech.runtimeReady,detailAdapter:a?.detail||[],optimizationAdapter:a?.optimization||[],cpuSafe:a?.gpuOptional!==false,experimental:!!a?.experimental,generic:!!a?.generic,productionReady:tech.runtimeReady?productionReady:false};
    routes.push(route);
    if(tech.runtimeReady&&(!detail||!optimization||a?.generic))blockers.push({technology:tech.id,reason:a?.generic?'generic-adapter-needs-review':'missing-detail-or-optimization-adapter'});
  }
  const runtime=routes.filter(x=>x.runtimeReady),integrated=runtime.filter(x=>x.productionReady);
  const out={schemaVersion:'6.0.0',system:'WORLD_GRAPHICS_TECHNOLOGY_INTEGRATION',generatedAt:new Date().toISOString(),policy:'every-runtime-tech-gets-detail-plus-optimization',routes,blockers,connectivityPercent:runtime.length?Math.round(integrated.length/runtime.length*100):100,hardGateReady:blockers.length===0};
  fs.writeFileSync(path.join(ROOT,'WORLD_GRAPHICS_TECHNOLOGY_INTEGRATION_REPORT.json'),JSON.stringify(out,null,2)+'\n');return out;
}
if(require.main===module){const o=integrate();console.log(`[GRAPHICS_TECH_INTEGRATOR] connectivity ${o.connectivityPercent}% blockers=${o.blockers.length}`);if(!o.hardGateReady)process.exitCode=1}
module.exports={integrate};
