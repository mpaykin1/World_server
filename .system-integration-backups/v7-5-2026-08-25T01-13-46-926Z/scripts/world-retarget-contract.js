#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const aliases={hips:['Hips','hips','pelvis','Pelvis','mixamorigHips'],spine:['Spine','spine','Spine1','spine_01'],head:['Head','head'],leftFoot:['LeftFoot','foot_l','Left Foot'],rightFoot:['RightFoot','foot_r','Right Foot'],leftHand:['LeftHand','hand_l','Left Hand'],rightHand:['RightHand','hand_r','Right Hand']};
const constraints={feetPlant:true,twoHandWeapon:true,shieldFront:true,rootMotionDirection:true,maxFootSlideMetersPerSecond:.18,maxJitterDegreesPerFrame:12};
let evidence={};try{evidence=JSON.parse(fs.readFileSync(path.join(ROOT,'data/world-animation-runtime-evidence.json'),'utf8'))}catch{}
const samples=Array.isArray(evidence.samples)?evidence.samples:[];
const mapped=samples.filter(s=>s?.skeletonMap&&Object.keys(s.skeletonMap).length>=6).length;
const report={schemaVersion:'5.0.0',system:'WORLD_RETARGET_CONTRACT',generatedAt:new Date().toISOString(),boneAliases:aliases,constraints,runtimeSamples:samples.length,mappedRuntimeSamples:mapped,contractReady:true,runtimeEvidenceReady:samples.length>0&&mapped===samples.length,note:samples.length?'Runtime skeleton evidence evaluated.':'Universal semantic contract is installed; real rig evidence is still required for 100% animation.'};
fs.writeFileSync(path.join(ROOT,'WORLD_RETARGET_CONTRACT_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[WORLD_RETARGET_CONTRACT_V5] contract ready · runtime samples=${samples.length}`);
