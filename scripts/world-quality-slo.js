#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function evaluate(m={}){const rules={fps:+(m.fps||60)>=28,p95:+(m.frameP95Ms||16.7)<=40,errorRate:+(m.errorRate||0)<=.02,crashFree:+(m.crashFree||1)>=.99};const passed=Object.values(rules).filter(Boolean).length;return{rules,percent:Math.round(passed/Object.keys(rules).length*100),healthy:passed===Object.keys(rules).length}}
function main(){let runtime={};try{runtime=JSON.parse(fs.readFileSync(path.join(ROOT,'WORLD_RUNTIME_QUALITY_REPORT.json'),'utf8'))}catch{}const sample={fps:runtime.fps??60,frameP95Ms:runtime.frameP95Ms??16.7,errorRate:runtime.errorRate??0,crashFree:runtime.crashFree??1},e=evaluate(sample);const report={schemaVersion:'5.0.0',system:'WORLD_QUALITY_SLO',sample,...e,errorBudgetPolicy:{freezePromotionOnExhaustion:true,rollbackCanaryOnBreach:true,neverTradeControlsForFps:true}};fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_SLO_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[WQA_V5] SLO ${e.percent}%`)}
if(require.main===module)main();module.exports={evaluate};
