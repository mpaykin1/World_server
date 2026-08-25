#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const read=p=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return {}}};
const s=v=>JSON.stringify(v||{}).toLowerCase();
function classifyEvidence(v){const x=s(v);if(/synthetic|fixture|cube_object|local-test/.test(x))return'synthetic';if(/emulat|playwright|webkit|chromium/.test(x))return'emulated';if(/physical-ios|physical-android|device-farm|real-device/.test(x))return'physical';if(/user-approved|human-approved|manual-approved/.test(x))return'user-approved';if(/runtime|production|telemetry/.test(x))return'runtime';return'unknown'}
function guard(){
  const baselines=read('data/visual-baselines.json'),rig=read('data/world-animation-runtime-evidence.json'),devices=read('data/real-device-provider.json');
  const visual=(baselines.approvedBaselines||[]).map(x=>({id:x.id||x.view||'baseline',provenance:classifyEvidence(x),countsForAesthetic100:['user-approved','physical'].includes(classifyEvidence(x))}));
  const rigs=(rig.samples||[]).map(x=>({id:x.id||'rig',provenance:classifyEvidence(x),countsForProductionAnimation100:['physical','runtime','user-approved'].includes(classifyEvidence(x))&&!/synthetic/.test(s(x))}));
  const physicalConfigured=String(devices.status||'').toUpperCase()==='CONFIGURED';
  const proof={visualAesthetic:visual.some(x=>x.countsForAesthetic100),realRig:rigs.some(x=>x.countsForProductionAnimation100),physicalDevices:physicalConfigured};
  const out={schemaVersion:'6.0.0',system:'WORLD_EVIDENCE_PROVENANCE_GUARD',generatedAt:new Date().toISOString(),visual,rigs,physicalDeviceStatus:devices.status||'UNKNOWN',proof,productionProofPercent:Math.round(Object.values(proof).filter(Boolean).length/Object.keys(proof).length*100),rule:'synthetic/emulated evidence validates contracts but cannot unlock production 100%'};
  fs.writeFileSync(path.join(ROOT,'WORLD_EVIDENCE_PROVENANCE_REPORT.json'),JSON.stringify(out,null,2)+'\n');return out;
}
if(require.main===module){const o=guard();console.log(`[EVIDENCE_PROVENANCE] production proof ${o.productionProofPercent}%`)}
module.exports={guard,classifyEvidence};
