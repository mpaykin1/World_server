#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=(p,f={})=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}};
function synthetic(s){return /synthetic|local-test|fixture/i.test(JSON.stringify(s||{}))}
function validate(policy=read('data/world-quality-autopilot.json',{}),evidence=read('data/world-animation-runtime-evidence.json',{})){
  const rules=policy?.animation?.semanticRules||{},required=Object.entries(rules).filter(([,v])=>v===true).map(([k])=>k),samples=Array.isArray(evidence.samples)?evidence.samples:[],real=samples.filter(x=>!synthetic(x)),violations=[];
  for(const s of samples)for(const r of required)if(s?.checks?.[r]===false)violations.push({sampleId:s.id||null,character:s.character||null,rule:r,repaired:s?.repaired?.includes?.(r)||false,synthetic:synthetic(s)});
  const installed=(()=>{try{return fs.readFileSync(path.join(ROOT,'shared/world-quality-autopilot.js'),'utf8').includes('registerCharacterSemanticAdapter')}catch{return false}})();
  return{schemaVersion:'6.0.0',system:'WORLD_ANIMATION_SEMANTIC_VALIDATOR',generatedAt:new Date().toISOString(),configuredRules:required,semanticRepairRuntimeInstalled:installed,runtimeEvidence:samples.length>0,realRuntimeEvidence:real.length>0,samples:samples.length,realSamples:real.length,syntheticSamples:samples.length-real.length,violations,pass:real.length>0&&violations.filter(v=>!v.synthetic).length===0,note:real.length?'Real rig runtime evidence evaluated.':'Synthetic rig tests validate contracts only. Real generated/Roblox/Godot rig playback is still required for production animation 100%.'};
}
function main(){const report=validate();fs.writeFileSync(path.join(ROOT,'WORLD_ANIMATION_SEMANTIC_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[WORLD_ANIMATION_SEMANTIC_VALIDATOR] rules=${report.configuredRules.length} real=${report.realSamples} synthetic=${report.syntheticSamples} violations=${report.violations.length}`);if(report.realSamples&&report.violations.some(v=>!v.synthetic&&!v.repaired))process.exitCode=1}
if(require.main===module)main();module.exports={validate,synthetic};
