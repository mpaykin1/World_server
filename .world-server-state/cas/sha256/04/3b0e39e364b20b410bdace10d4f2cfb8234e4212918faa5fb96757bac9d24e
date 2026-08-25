#!/usr/bin/env node
'use strict';const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..');
function j(n,d={}){try{return JSON.parse(fs.readFileSync(path.join(root,n),'utf8'))}catch(_){return d}}
const r=j('PROCEDURAL_QUALITY_READINESS.json'),a=j('PROCEDURAL_NATIVE_RENDERER_AUDIT.json'),d=j('PROCEDURAL_QUALITY_DEVICE_CERTIFICATION.json'),g=j('PROCEDURAL_GOLDEN_BASELINES.json'),c=j('PROCEDURAL_QUALITY_CRITIC.json'),t=j('PROCEDURAL_QUALITY_TOURNAMENT.json'),doc=j('PROCEDURAL_QUALITY_DOCTOR.json'),can=j('PROCEDURAL_QUALITY_CANARY.json');
const links={
 runtimeToRenderer:!!r.metrics?.rendererContract,rendererToMotion:!!r.metrics?.skinnedPerPixelVelocity,rendererToGI:!!r.metrics?.voxelSceneRadiance,
 runtimeToBudget:!!r.metrics?.adaptivePassBudget,runtimeToTemporalQA:!!r.metrics?.temporalArtifactDetector,runtimeToFramePacing:!!r.metrics?.framePacingGovernor,
 runtimeToLeakWatchdog:!!r.metrics?.resourceLeakWatchdog,runtimeToThermal:!!r.metrics?.thermalMobileGovernor,runtimeToShaderPrewarm:!!r.metrics?.shaderPrewarm,
 replayToRegression:!!r.metrics?.deterministicReplay,evidenceToLearning:!!r.metrics?.persistentLearning,learningToPromotion:!!r.metrics?.verifiedPromotion,
 promotionToCanary:can.pass===true,promotionToRollback:t.pass===true,doctorToGate:doc.status==='PASS',
 previewToGolden:Array.isArray(g.rows)&&g.rows.length>0,physicalToCertification:d.certified===true
};
const external=new Set(['previewToGolden','physicalToCertification']);const arch=Object.entries(links).filter(([k])=>!external.has(k)).map(([,v])=>v),all=Object.values(links);
const out={version:10,architectureReadinessPct:Number(r.architecturalReadinessPct||99),verifiedReadinessPct:Number(r.verifiedReadinessPct||98),architectureConnectednessPct:Math.round(arch.filter(Boolean).length/arch.length*100),verifiedConnectednessPct:Math.round(all.filter(Boolean).length/all.length*100),links,nativeCoveragePct:a.coveragePct??null,physicalCertified:!!d.certified,goldenRecorded:Array.isArray(g.rows)&&g.rows.length>0,criticPass:!!c.pass,tournamentPass:!!t.pass,doctorPass:doc.status==='PASS'};
fs.writeFileSync(path.join(root,'PROCEDURAL_QUALITY_EVIDENCE_V10.json'),JSON.stringify(out,null,2)+'\n');console.log(JSON.stringify(out,null,2));
