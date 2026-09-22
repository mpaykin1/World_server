#!/usr/bin/env node
'use strict';

const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const { createEmergenceStateFromIdea, advanceEmergence }=require('../lib/world-emergence');

function read(p){try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch{return''}}
const api=read('api/voxel.js'),client=read('apps/voxel-world/client.js'),runtime=read('shared/world-emergence-runtime.js'),factory=read('lib/world-factory.js'),html=read('apps/voxel-world/index.html');
let state=createEmergenceStateFromIdea({idea:'город рядом с природой',seed:4242});
while(state.growthStage<state.maxGrowthStage)state=advanceEmergence(state,4242);

const checks=[
  ['cityNatureRelation',state.relations.some(r=>r.kind==='living_frontier')],
  ['interestLoop',Number(state.interestScore)>=0.7],
  ['progressiveFiveStages',state.growthStage===5&&state.features.length>=5],
  ['worldFactorySeed',/createEmergenceStateFromIdea/.test(factory)&&/emergence,/.test(factory)],
  ['serverPersistence',/actionMacroPlace/.test(api)&&/settings:\s*current\.settings/.test(api)],
  ['serverGrowth',/actionMacroTick/.test(api)&&/advanceEmergence/.test(api)],
  ['realtimeSync',/event:'macro_state'/.test(client)&&/channel\.send\(\{type:'broadcast',event:'macro_state'/.test(client)],
  ['kidPlacementUI',/Большие вещи/.test(client)&&/Поставить/.test(client)&&/macro_place/.test(client)],
  ['voxelMaterialization',/applyEmergenceColumn/.test(client)&&/WorldEmergenceRuntime\?\.column/.test(client)],
  ['runtimeLoaded',/world-emergence-runtime\.js/.test(html)&&/window\.WorldEmergenceRuntime/.test(runtime)]
];
const passed=checks.filter(([,ok])=>ok).length,percent=Math.round(passed/checks.length*100);
const report={schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),percent,hardGateReady:percent>=85,scenario:'place-two-large-things-and-watch-the-world-emerge',checks:Object.fromEntries(checks),evidence:{entities:state.entities.map(e=>e.type),relationKinds:state.relations.map(r=>r.kind),features:state.features.map(f=>f.kind),interestScore:state.interestScore,growthStage:state.growthStage}};
fs.writeFileSync(path.join(ROOT,'WORLD_EMERGENCE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[WORLD_EMERGENCE] ${percent}% ${report.hardGateReady?'READY':'BLOCKED'}`);
if(percent<85)process.exitCode=2;
