#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
function read(p,f={}){try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return f}}
const cfg=read('data/world-quality-autopilot.json',{}),tiers=cfg?.runtime?.tiers||{};
const candidates=[];for(const [tier,t] of Object.entries(tiers))for(const delta of [-.08,0,.08]){const detail=Math.max(.35,Math.min(1.4,(t.detailRadius||1)+delta));const dpr=Math.max(.65,Math.min(2,(t.maxDpr||1)+delta));const quality=(detail*42+dpr*25+(t.pbrQuality||0)*10+(t.shadowQuality||0)*6);const cost=dpr*dpr*32+detail*18+(t.pbrQuality||0)*8+(t.shadowQuality||0)*7;const score=quality-Math.max(0,cost-70)*.55;candidates.push({id:`${tier.toLowerCase()}-${String(delta).replace('.','p')}`,tier,detailRadius:+detail.toFixed(2),maxDpr:+dpr.toFixed(2),predictedQuality:+quality.toFixed(2),predictedCost:+cost.toFixed(2),winnerScore:+score.toFixed(2)})}
candidates.sort((a,b)=>b.winnerScore-a.winnerScore);const winner=candidates[0]||null;
const out={schemaVersion:'5.0.0',system:'WORLD_CANDIDATE_LAB',generatedAt:new Date().toISOString(),candidateCount:candidates.length,winner,winnerOnly:true,mutationAllowed:false,note:'Prediction-only lab. Winner must still pass candidate tournament, real regression, visual, controls, collisions and device gates before promotion.',candidates};fs.writeFileSync(path.join(ROOT,'WORLD_CANDIDATE_LAB_REPORT.json'),JSON.stringify(out,null,2)+'\n');console.log(`[WORLD_CANDIDATE_LAB_V5] candidates=${candidates.length} winner=${winner?.id||'none'}`);
