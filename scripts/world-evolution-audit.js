#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {compileWorldEvolutionRecipe,sampleEvolution,evaluateEvolutionQuality,containsPrebuiltScenePayload}=require('../lib/world-evolution');
const ROOT=process.cwd(),source='apps/cube-world-evolution-mvp/recipe.json';
const raw=JSON.parse(fs.readFileSync(path.join(ROOT,source),'utf8')),recipe=compileWorldEvolutionRecipe(raw);
const probes=[
  {t:.05,metrics:{},expect:[]},
  {t:.72,metrics:{semanticDetail:.1},expect:['SEMANTIC_DETAIL_FAIL']},
  {t:.84,metrics:{semanticDetail:.9,materialRichness:.1,lightingResponse:.9},expect:['MATERIAL_FAIL']},
  {t:.91,metrics:{semanticDetail:.9,materialRichness:.9,lightingResponse:.1,lifeMotion:.9},expect:['LIGHTING_FAIL']}
];
const evidence=probes.map(p=>{const r=evaluateEvolutionQuality(sampleEvolution(recipe,p.t),p.metrics);return{t:p.t,failures:r.failures,expected:p.expect,pass:JSON.stringify(r.failures)===JSON.stringify(p.expect)}});
const checks={oneSeed:recipe.initialSeed==='CUBE',deterministicSeed:Number.isInteger(recipe.seed)&&recipe.seed>0,noPrebuiltScene:!containsPrebuiltScenePayload(raw),timelineComplete:sampleEvolution(recipe,1).complete,stageAwareProbes:evidence.every(x=>x.pass)};
const passed=Object.values(checks).filter(Boolean).length,total=Object.keys(checks).length;
const report={schemaVersion:'1.0.0',system:'WORLD_EVOLUTION_AUDIT',generatedAt:new Date().toISOString(),source,checks,evidence,percent:Math.round(100*passed/total),hardGateReady:passed===total};
fs.writeFileSync(path.join(ROOT,'WORLD_EVOLUTION_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[WORLD_EVOLUTION_AUDIT] ${report.percent}% · ${report.hardGateReady?'READY':'BLOCKED'}`);
if(!report.hardGateReady)process.exitCode=1;
