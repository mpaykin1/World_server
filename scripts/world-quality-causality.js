#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function compare(base={},cand={}){const keys=['visual','fps','frameP95','memory','controls','collisions','mobile'];const delta={};let regressions=[];for(const k of keys){const a=Number(base[k]),b=Number(cand[k]);if(Number.isFinite(a)&&Number.isFinite(b)){delta[k]=+(b-a).toFixed(4);const higherBad=['frameP95','memory'].includes(k);if((higherBad&&b>a)||(!higherBad&&b<a))regressions.push(k)}}return{delta,regressions,winner:regressions.length===0,mutationAllowed:false,promotionRequiresTournament:true}}
function main(){const report={schemaVersion:'5.0.0',system:'WORLD_QUALITY_CAUSALITY',policy:{counterfactualComparison:true,oneChangeClassPerExperiment:true,mutationAllowed:false,promotionRequiresTournament:true},example:compare({visual:90,fps:45,controls:1},{visual:91,fps:46,controls:1})};fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_CAUSALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log('[WQA_V5] causality guard ready')}
if(require.main===module)main();module.exports={compare};
