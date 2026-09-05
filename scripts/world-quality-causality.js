#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const REQUIRED_METRICS=['visual','fps','frameP95','memory','controls','collisions','mobile'];

function compare(base={},cand={}){
  const delta={};
  const regressions=[];
  const missingMetrics=[];
  for(const k of REQUIRED_METRICS){
    const a=Number(base[k]),b=Number(cand[k]);
    if(!Number.isFinite(a)||!Number.isFinite(b)){
      missingMetrics.push(k);
      continue;
    }
    delta[k]=+(b-a).toFixed(4);
    const higherBad=['frameP95','memory'].includes(k);
    if((higherBad&&b>a)||(!higherBad&&b<a))regressions.push(k);
  }
  const evidenceComplete=missingMetrics.length===0;
  return{delta,regressions,missingMetrics,evidenceComplete,winner:evidenceComplete&&regressions.length===0,mutationAllowed:false,promotionRequiresTournament:true};
}

function main(){
  const report={schemaVersion:'5.1.0',system:'WORLD_QUALITY_CAUSALITY',policy:{counterfactualComparison:true,oneChangeClassPerExperiment:true,failClosedOnMissingEvidence:true,requiredMetrics:REQUIRED_METRICS,mutationAllowed:false,promotionRequiresTournament:true},example:compare({visual:90,fps:45,frameP95:22,memory:512,controls:1,collisions:1,mobile:1},{visual:91,fps:46,frameP95:21,memory:500,controls:1,collisions:1,mobile:1})};
  fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_CAUSALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log('[WQA_V5_1] causality guard ready; missing evidence fails closed');
}
if(require.main===module)main();
module.exports={compare,REQUIRED_METRICS};
