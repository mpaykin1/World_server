#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const exists=p=>fs.existsSync(path.join(ROOT,p));
const text=p=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch{return''}};
const has=(p,s)=>text(p).includes(s);
const read=(p,f={})=>{try{return JSON.parse(text(p))}catch{return f}};
function weightedScore(items){const total=items.reduce((a,c)=>a+(+c.weight||0),0),pass=items.reduce((a,c)=>a+(c.ok?(+c.weight||0):0),0);return total?Math.round(pass/total*100):0}
function computeReadiness(domains,weights){let sum=0,ww=0,scores={};for(const[k,v]of Object.entries(domains)){const sc=weightedScore(v),w=+weights[k]||0;scores[k]=sc;sum+=sc*w;ww+=w}return{scores,overall:ww?Math.round(sum/ww):0}}
function checksForDomain(){
 const baselines=read('data/visual-baselines.json',{approvedBaselines:[]}),approved=Array.isArray(baselines.approvedBaselines)&&baselines.approvedBaselines.length>0;
 const anim=read('data/world-animation-runtime-evidence.json',{samples:[]}),rigEvidence=Array.isArray(anim.samples)&&anim.samples.length>0;
 const dev=read('data/real-device-provider.json',{}),physical=String(dev.status||'').toUpperCase()==='CONFIGURED';
 return{
  detail:[
   {id:'server-semantic-enhancer-v4',weight:18,ok:has('api/ai3d-voxel-generate.js','enhanceVoxelWorld')},
   {id:'worker-semantic-enhancer-v4',weight:14,ok:has('services/ai3d-worker/ai3d/plugins/world_quality.py',"VERSION='4.0.0'")},
   {id:'semantic-detail-index',weight:14,ok:exists('lib/world-quality-semantic-detail.js')},
   {id:'material-aware-detail',weight:10,ok:exists('lib/world-quality-material-profiler.js')},
   {id:'pbr-aware-detail-metadata',weight:10,ok:has('lib/world-quality-voxel-enhancer.js','pbrProfiles')},
   {id:'mesh-quality-optimizer',weight:10,ok:exists('services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py')||exists('apps/ai3d-voxel-city/mesher-worker.js')},
   {id:'reference-verifier',weight:12,ok:exists('services/ai3d-worker/ai3d_voxel_verifier/verifier.py')||has('services/ai3d-worker/ai3d/runner.py','verify_voxel_city')},
   {id:'front-projection-invariant',weight:12,ok:has('lib/world-quality-voxel-enhancer.js','sameFrontProjection')}
  ],
  graphics:[
   {id:'visual-policy',weight:8,ok:exists('data/visual-quality-policy.json')},
   {id:'perceptual-gate',weight:8,ok:exists('scripts/perceptual-visual-gate.js')},
   {id:'visual-critic',weight:8,ok:exists('scripts/ai-visual-critic.js')},
   {id:'golden-assets',weight:6,ok:exists('scripts/golden-asset-bot.js')},
   {id:'runtime-controller-v4',weight:12,ok:has('shared/world-quality-autopilot.js',"version:'4.0.0'")},
   {id:'semantic-material-profiler',weight:10,ok:exists('lib/world-quality-material-profiler.js')},
   {id:'procedural-pbr-synthesizer',weight:14,ok:exists('lib/world-quality-pbr-synthesizer.js')},
   {id:'texture-budgeting',weight:10,ok:has('shared/world-quality-autopilot.js','textureBudgetScale')},
   {id:'virtual-atlas-planning',weight:7,ok:has('data/world-quality-autopilot.json','virtualAtlasPlanning')},
   {id:'baseline-candidate-automation',weight:7,ok:exists('scripts/world-visual-baseline-candidates.js')},
   {id:'explicit-baseline-promotion',weight:7,ok:exists('scripts/world-visual-baseline-promote.js')},
   {id:'approved-visual-baselines',weight:3,ok:approved}
  ],
  animation:[
   {id:'adaptive-animation-budget',weight:15,ok:has('shared/world-quality-autopilot.js','setAnimationHz')},
   {id:'semantic-repair-runtime',weight:18,ok:has('shared/world-quality-autopilot.js','registerCharacterSemanticAdapter')},
   {id:'semantic-rules',weight:12,ok:exists('scripts/world-animation-semantic-validator.js')},
   {id:'ik-budget',weight:10,ok:has('shared/world-quality-autopilot.js','setIkBudget')},
   {id:'foot-slide-jitter-validation',weight:13,ok:has('shared/world-quality-autopilot.js','footSlideWithinTolerance')&&has('shared/world-quality-autopilot.js','animationJitterWithinTolerance')},
   {id:'universal-retarget-contract',weight:15,ok:exists('scripts/world-retarget-contract.js')},
   {id:'root-motion-two-hand-contract',weight:12,ok:has('data/world-quality-autopilot.json','rootMotionValidation')&&has('data/world-quality-autopilot.json','twoHandConstraintContract')},
   {id:'runtime-rig-evidence',weight:5,ok:rigEvidence}
  ],
  optimization:[
   {id:'performance-budgets',weight:7,ok:exists('data/performance-budgets.json')},
   {id:'adaptive-runtime',weight:10,ok:exists('shared/world-quality-autopilot.js')},
   {id:'gpu-timing-query',weight:9,ok:has('shared/world-quality-autopilot.js','EXT_disjoint_timer_query_webgl2')},
   {id:'longtask-memory-device-pressure',weight:10,ok:has('shared/world-quality-autopilot.js','PerformanceObserver')&&has('shared/world-quality-autopilot.js','deviceMemory')},
   {id:'sustained-pressure-thermal-proxy',weight:8,ok:has('shared/world-quality-autopilot.js','thermalProxy')},
   {id:'visibility-scene-budget',weight:10,ok:has('shared/world-quality-autopilot.js','registerVisibilityAdapter')},
   {id:'sector-visibility-optimizer',weight:10,ok:exists('scripts/world-visibility-optimizer.js')},
   {id:'texture-memory-budget',weight:8,ok:has('shared/world-quality-autopilot.js','textureBudgetScale')},
   {id:'greedy-meshing',weight:8,ok:exists('apps/ai3d-voxel-city/mesher-worker.js')},
   {id:'hlod-streaming',weight:7,ok:has('api/ai3d-voxel-generate.js','chunk_aabb_hlod')||has('apps/ai3d-voxel-city/client.js','far.visible')},
   {id:'asset-dedup',weight:5,ok:exists('scripts/asset-dedup-cache.js')},
   {id:'gpu-autoscaler',weight:6,ok:exists('scripts/gpu-autoscaler.js')},
   {id:'physical-device-evidence',weight:2,ok:physical}
  ],
  automation:[
   {id:'world-orchestrator-v4',weight:12,ok:has('scripts/world-quality-autopilot.js','world-quality-scheduler.js')},
   {id:'semantic-index-automation',weight:6,ok:exists('scripts/world-semantic-detail-indexer.js')},
   {id:'material-synthesis-automation',weight:8,ok:exists('scripts/world-material-synthesis.js')},
   {id:'visibility-automation',weight:7,ok:exists('scripts/world-visibility-optimizer.js')},
   {id:'retarget-contract-automation',weight:7,ok:exists('scripts/world-retarget-contract.js')},
   {id:'cost-quality-scheduler',weight:8,ok:exists('scripts/world-quality-scheduler.js')},
   {id:'feedback-learner',weight:8,ok:exists('scripts/world-feedback-learner.js')},
   {id:'candidate-lab',weight:8,ok:exists('scripts/world-candidate-lab.js')},
   {id:'evidence-ledger',weight:7,ok:exists('scripts/world-quality-evidence-ledger.js')},
   {id:'baseline-promotion-guard',weight:5,ok:exists('scripts/world-visual-baseline-promote.js')},
   {id:'durable-cycle',weight:6,ok:exists('scripts/durable-quality-cycle.js')},
   {id:'regression-gate',weight:6,ok:exists('scripts/quality-regression-gate.js')},
   {id:'patch-tournament',weight:5,ok:exists('scripts/quality-patch-tournament.js')},
   {id:'risk-root-cause',weight:4,ok:exists('scripts/quality-risk-predictor.js')&&exists('scripts/quality-root-cause.js')},
   {id:'quality-workflow',weight:3,ok:exists('.github/workflows/world-quality-autopilot.yml')},
   {id:'desktop-ai-continuity',weight:2,ok:exists('DESKTOP_AI_INSTALL_AND_VERIFY.md')&&exists('WORK_IN_PROGRESS.md')}
  ]
 }
}
function analyze(){const p=read('data/world-quality-autopilot.json',{weights:{detail:.24,graphics:.22,animation:.16,optimization:.22,automation:.16},release:{minimumSystemReadiness:85}}),d=checksForDomain(),r=computeReadiness(d,p.weights||{}),blockers=[];for(const[k,v]of Object.entries(d))for(const c of v)if(!c.ok)blockers.push({domain:k,id:c.id,weight:c.weight});const report={schemaVersion:'4.0.0',system:'WORLD_QUALITY_AUTOPILOT',generatedAt:new Date().toISOString(),readinessPercent:r.overall,domainPercent:r.scores,hardGateReady:r.overall>=+(p.release?.minimumSystemReadiness||85),blockers,evidence:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.map(c=>({id:c.id,ok:c.ok,weight:c.weight}))]))};fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_AUTOPILOT_REPORT.json'),JSON.stringify(report,null,2)+'\n');return report}
if(require.main===module){const r=analyze();console.log(`[WORLD_QUALITY_AUTOPILOT_V4] readiness ${r.readinessPercent}%`);for(const[k,v]of Object.entries(r.domainPercent))console.log(`  ${k}: ${v}%`);if(!r.hardGateReady)process.exitCode=1}
module.exports={analyze,checksForDomain,computeReadiness,weightedScore};
