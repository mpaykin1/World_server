#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const ROOT=process.cwd();
const exists=p=>fs.existsSync(path.join(ROOT,p));
const text=p=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8')}catch{return''}};
const has=(p,s)=>text(p).includes(s);
const read=(p,f={})=>{try{return JSON.parse(text(p))}catch{return f}};
function weightedScore(items){const total=items.reduce((a,c)=>a+(+c.weight||0),0),pass=items.reduce((a,c)=>a+(c.ok?(+c.weight||0):0),0);return total?Math.round(pass/total*100):0}
function computeReadiness(domains,weights){let sum=0,ww=0,scores={};for(const[k,v]of Object.entries(domains)){const sc=weightedScore(v),w=+weights[k]||0;scores[k]=sc;sum+=sc*w;ww+=w}return{scores,overall:ww?Math.round(sum/ww):0}}
function baselineCoverage(
  baselines = read('data/visual-baselines.json', { approvedBaselines: [] }),
  candidates = read('WORLD_VISUAL_BASELINE_CANDIDATES.json', { candidates: [] })
) {
  const requiredIds = [...new Set(
    (Array.isArray(candidates.candidates) ? candidates.candidates : [])
      .map((x) => String(x?.id || '').trim())
      .filter(Boolean)
  )];

  const approvedIds = new Set(
    (Array.isArray(baselines.approvedBaselines) ? baselines.approvedBaselines : [])
      .filter((x) => String(x?.status || 'APPROVED').toUpperCase() === 'APPROVED')
      .map((x) => String(x?.id || '').trim())
      .filter(Boolean)
  );

  const approvedRequiredIds = requiredIds.filter((id) => approvedIds.has(id));

  return {
    required: requiredIds.length,
    approved: approvedRequiredIds.length,
    requiredIds,
    approvedRequiredIds,
    complete: requiredIds.length > 0 && approvedRequiredIds.length === requiredIds.length
  };
}

function isSyntheticEvidence(sample) {
  const source = JSON.stringify(sample || {}).toLowerCase();
  return ['synthetic', 'fixture', 'mock', 'fake', 'local-test'].some((token) => source.includes(token));
}

function isProductionRigSample(sample) {
  return Boolean(
    sample &&
    sample.productionEligible === true &&
    !isSyntheticEvidence(sample) &&
    Object.keys(sample.skeletonMap || {}).length >= 6 &&
    sample.constraints &&
    typeof sample.constraints === 'object'
  );
}

function productionRigCoverage(
  animation = read('data/world-animation-runtime-evidence.json', { samples: [] })
) {
  const samples = Array.isArray(animation.samples) ? animation.samples : [];
  const real = samples.filter(isProductionRigSample);
  return {
    total: samples.length,
    real: real.length,
    synthetic: samples.filter(isSyntheticEvidence).length,
    complete: real.length > 0
  };
}

function evaluateProductionCertification(input = {}) {
  const baseline = input.baseline || { required: 0, approved: 0, complete: false };
  const rig = input.rig || { real: 0, complete: false };

  const physicalDeviceReady = Boolean(
    input.deviceProviderConfigured &&
    Number(input.deviceEvidencePercent) === 100 &&
    input.devicePhysicalProvider === true
  );

  const checks = [
    {
      id: 'all-visual-baselines-approved',
      ok: Boolean(baseline.complete),
      evidence: `${baseline.approved || 0}/${baseline.required || 0}`
    },
    {
      id: 'physical-device-evidence-100',
      ok: physicalDeviceReady,
      evidence: `${Number(input.deviceEvidencePercent) || 0}%`
    },
    {
      id: 'production-runtime-rig-evidence',
      ok: Boolean(rig.complete),
      evidence: `real:${rig.real || 0}`
    },
    {
      id: 'required-ci-pass',
      ok: input.requiredCiPass === true,
      evidence: input.requiredCiPass === true ? 'verified' : 'not-verified'
    }
  ];

  const baselineRatio = baseline.required > 0
    ? Math.min(1, (baseline.approved || 0) / baseline.required)
    : 0;
  const rigRatio = rig.real > 0 ? 1 : 0;

  const evidencePercent = Math.round(
    baselineRatio * 35 +
    (physicalDeviceReady ? 25 : 0) +
    rigRatio * 25 +
    (input.requiredCiPass === true ? 15 : 0)
  );

  return {
    ready: checks.every((x) => x.ok),
    evidencePercent,
    checks,
    blockers: checks.filter((x) => !x.ok).map((x) => x.id)
  };
}

function certifiedReadiness(rawReadiness, certification) {
  return certification?.ready ? rawReadiness : Math.min(rawReadiness, 99);
}

function checksForDomain(){
 const baselines=read('data/visual-baselines.json',{approvedBaselines:[]}),approvedList=Array.isArray(baselines.approvedBaselines)?baselines.approvedBaselines:[],approved=approvedList.filter(x=>{const t=JSON.stringify(x).toLowerCase();return /(user-approved|human-approved|manual-approved)/.test(t)&&!/(synthetic|fixture|auto-verified)/.test(t)}).length>=4;
 const anim=read('data/world-animation-runtime-evidence.json',{samples:[]}),rigEvidence=Array.isArray(anim.samples)&&anim.samples.some(x=>!/synthetic|local-test|fixture/i.test(JSON.stringify(x)));
 const dev=read('data/real-device-provider.json',{}),physical=String(dev.status||'').toUpperCase()==='CONFIGURED';
 return{
  detail:[
   {id:'server-semantic-enhancer-v5',weight:12,ok:has('lib/api-handlers/ai3d-voxel-generate.js','enhanceVoxelWorld')},
   {id:'worker-semantic-enhancer-v5',weight:10,ok:has('services/ai3d-worker/ai3d/plugins/world_quality.py',"VERSION='5.0.0'")||has('services/ai3d-worker/ai3d/plugins/world_quality.py','VERSION = \'5.0.0\'')},
   {id:'semantic-detail-index',weight:10,ok:exists('lib/world-quality-semantic-detail.js')},
   {id:'importance-detail-budget',weight:12,ok:exists('lib/world-quality-detail-budget.js')},
   {id:'hero-landmark-protection',weight:8,ok:has('lib/world-quality-detail-budget.js','protected')},
   {id:'material-aware-detail',weight:8,ok:exists('lib/world-quality-material-profiler.js')},
   {id:'pbr-aware-detail-metadata',weight:8,ok:has('lib/world-quality-voxel-enhancer.js','pbrProfiles')},
   {id:'mesh-quality-optimizer',weight:8,ok:exists('services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py')||exists('apps/ai3d-voxel-city/mesher-worker.js')},
   {id:'reference-verifier',weight:8,ok:exists('services/ai3d-worker/ai3d_voxel_verifier/verifier.py')||has('services/ai3d-worker/ai3d/runner.py','verify_voxel_city')},
   {id:'front-projection-invariant',weight:8,ok:has('lib/world-quality-voxel-enhancer.js','sameFrontProjection')},
   {id:'streaming-topology',weight:8,ok:exists('scripts/world-streaming-topology.js')},
   {id:'graphics-tech-detail-adapters',weight:8,ok:exists('data/world-graphics-technology-adapters.json')&&exists('scripts/world-graphics-technology-integrator.js')}
  ],
  graphics:[
   {id:'visual-policy',weight:7,ok:exists('data/visual-quality-policy.json')},
   {id:'perceptual-gate',weight:7,ok:exists('scripts/perceptual-visual-gate.js')},
   {id:'visual-critic',weight:6,ok:exists('scripts/ai-visual-critic.js')},
   {id:'golden-assets',weight:5,ok:exists('scripts/golden-asset-bot.js')},
   {id:'runtime-controller-v6',weight:9,ok:(has('shared/world-quality-autopilot.js',"version:'5.0.0'")||has('shared/world-quality-autopilot.js',"version:'6.0.0'"))},
   {id:'semantic-material-profiler',weight:7,ok:exists('lib/world-quality-material-profiler.js')},
   {id:'procedural-pbr-synthesizer',weight:8,ok:exists('lib/world-quality-pbr-synthesizer.js')},
   {id:'texture-baker-contract',weight:8,ok:exists('lib/world-quality-texture-baker-contract.js')},
   {id:'texture-budgeting',weight:7,ok:has('shared/world-quality-autopilot.js','textureBudgetScale')},
   {id:'virtual-atlas-planning',weight:5,ok:has('data/world-quality-autopilot.json','virtualAtlasPlanning')},
   {id:'shader-cost-auditor',weight:7,ok:exists('scripts/world-shader-cost-auditor.js')},
   {id:'multiview-visual-gate',weight:7,ok:exists('scripts/world-multiview-visual-gate.js')},
   {id:'baseline-candidate-automation',weight:6,ok:exists('scripts/world-visual-baseline-candidates.js')},
   {id:'explicit-baseline-promotion',weight:5,ok:exists('scripts/world-visual-baseline-promote.js')},
   {id:'approved-multiview-baselines',weight:1,ok:approved},
   {id:'graphics-tech-scout',weight:7,ok:exists('scripts/world-graphics-technology-scout.js')},
   {id:'evidence-provenance-guard',weight:5,ok:exists('scripts/world-evidence-provenance-guard.js')}
  ],
  animation:[
   {id:'adaptive-animation-budget',weight:13,ok:has('shared/world-quality-autopilot.js','setAnimationHz')},
   {id:'semantic-repair-runtime',weight:14,ok:has('shared/world-quality-autopilot.js','registerCharacterSemanticAdapter')},
   {id:'semantic-rules',weight:10,ok:exists('scripts/world-animation-semantic-validator.js')},
   {id:'ik-budget',weight:9,ok:has('shared/world-quality-autopilot.js','setIkBudget')},
   {id:'foot-slide-jitter-validation',weight:11,ok:has('shared/world-quality-autopilot.js','footSlideWithinTolerance')&&has('shared/world-quality-autopilot.js','animationJitterWithinTolerance')},
   {id:'universal-retarget-contract',weight:12,ok:exists('scripts/world-retarget-contract.js')},
   {id:'root-motion-two-hand-contract',weight:10,ok:has('data/world-quality-autopilot.json','rootMotionValidation')&&has('data/world-quality-autopilot.json','twoHandConstraintContract')},
   {id:'animation-distance-lod',weight:10,ok:exists('scripts/world-animation-lod-controller.js')},
   {id:'deterministic-animation-replay',weight:9,ok:exists('scripts/world-deterministic-replay.js')},
   {id:'runtime-rig-evidence',weight:2,ok:rigEvidence}
  ],
  optimization:[
   {id:'performance-budgets',weight:6,ok:exists('data/performance-budgets.json')},
   {id:'adaptive-runtime',weight:8,ok:exists('shared/world-quality-autopilot.js')},
   {id:'gpu-timing-query',weight:7,ok:has('shared/world-quality-autopilot.js','EXT_disjoint_timer_query_webgl2')},
   {id:'longtask-memory-device-pressure',weight:8,ok:has('shared/world-quality-autopilot.js','PerformanceObserver')&&has('shared/world-quality-autopilot.js','deviceMemory')},
   {id:'sustained-pressure-thermal-proxy',weight:6,ok:has('shared/world-quality-autopilot.js','thermalProxy')},
   {id:'visibility-scene-budget',weight:7,ok:has('shared/world-quality-autopilot.js','registerVisibilityAdapter')},
   {id:'sector-visibility-optimizer',weight:7,ok:exists('scripts/world-visibility-optimizer.js')},
   {id:'streaming-topology-prefetch',weight:8,ok:exists('scripts/world-streaming-topology.js')},
   {id:'texture-memory-budget',weight:7,ok:has('shared/world-quality-autopilot.js','textureBudgetScale')},
   {id:'greedy-meshing',weight:7,ok:exists('apps/ai3d-voxel-city/mesher-worker.js')},
   {id:'hlod-streaming',weight:6,ok:has('lib/api-handlers/ai3d-voxel-generate.js','chunk_aabb_hlod')||has('apps/ai3d-voxel-city/client.js','far.visible')},
   {id:'asset-dedup',weight:5,ok:exists('scripts/asset-dedup-cache.js')},
   {id:'gpu-autoscaler',weight:5,ok:exists('scripts/gpu-autoscaler.js')},
   {id:'shader-cost-budget',weight:6,ok:exists('scripts/world-shader-cost-auditor.js')},
   {id:'quality-slo',weight:6,ok:exists('scripts/world-quality-slo.js')},
   {id:'physical-device-evidence',weight:1,ok:physical},
   {id:'cpu-first-graphics-optimizer',weight:8,ok:exists('scripts/world-cpu-first-graphics-optimizer.js')},
   {id:'technology-specific-optimization',weight:8,ok:exists('scripts/world-graphics-technology-integrator.js')},
   {id:'technology-drift-gate',weight:6,ok:exists('scripts/world-technology-drift-gate.js')}
  ],
  automation:[
   {id:'world-orchestrator-v6',weight:9,ok:has('scripts/world-quality-autopilot.js','world-quality-slo.js')},
   {id:'semantic-index-automation',weight:5,ok:exists('scripts/world-semantic-detail-indexer.js')},
   {id:'material-synthesis-automation',weight:5,ok:exists('scripts/world-material-synthesis.js')},
   {id:'visibility-automation',weight:5,ok:exists('scripts/world-visibility-optimizer.js')},
   {id:'streaming-topology-automation',weight:6,ok:exists('scripts/world-streaming-topology.js')},
   {id:'deterministic-replay',weight:7,ok:exists('scripts/world-deterministic-replay.js')},
   {id:'quality-slo-error-budget',weight:7,ok:exists('scripts/world-quality-slo.js')},
   {id:'causality-guard',weight:7,ok:exists('scripts/world-quality-causality.js')},
   {id:'canary-release-plan',weight:6,ok:exists('scripts/world-canary-release.js')},
   {id:'retarget-contract-automation',weight:5,ok:exists('scripts/world-retarget-contract.js')},
   {id:'cost-quality-scheduler',weight:5,ok:exists('scripts/world-quality-scheduler.js')},
   {id:'feedback-learner',weight:5,ok:exists('scripts/world-feedback-learner.js')},
   {id:'candidate-lab',weight:5,ok:exists('scripts/world-candidate-lab.js')},
   {id:'evidence-ledger',weight:5,ok:exists('scripts/world-quality-evidence-ledger.js')},
   {id:'baseline-promotion-guard',weight:4,ok:exists('scripts/world-visual-baseline-promote.js')},
   {id:'durable-cycle',weight:4,ok:exists('scripts/durable-quality-cycle.js')},
   {id:'regression-gate',weight:4,ok:exists('scripts/quality-regression-gate.js')},
   {id:'patch-tournament',weight:4,ok:exists('scripts/quality-patch-tournament.js')},
   {id:'risk-root-cause',weight:3,ok:exists('scripts/quality-risk-predictor.js')&&exists('scripts/quality-root-cause.js')},
   {id:'quality-workflow',weight:2,ok:exists('.github/workflows/world-quality-autopilot.yml')},
   {id:'desktop-ai-continuity',weight:1,ok:exists('DESKTOP_AI_INSTALL_AND_VERIFY.md')&&exists('WORK_IN_PROGRESS.md')},
   {id:'technology-scout-every-cycle',weight:7,ok:has('scripts/world-quality-autopilot.js','world-graphics-technology-scout.js')},
   {id:'technology-connectivity-gate',weight:7,ok:exists('scripts/world-graphics-technology-integrator.js')&&exists('scripts/world-graphics-quality-router.js')},
   {id:'evidence-provenance-automation',weight:5,ok:exists('scripts/world-evidence-provenance-guard.js')}
  ]
 }
}
function analyze(){
 const p=read('data/world-quality-autopilot.json',{weights:{detail:.24,graphics:.22,animation:.16,optimization:.22,automation:.16},release:{minimumSystemReadiness:85}}),d=checksForDomain(),r=computeReadiness(d,p.weights||{}),blockers=[];
 for(const[k,v]of Object.entries(d))for(const c of v)if(!c.ok)blockers.push({domain:k,id:c.id,weight:c.weight});
 const baseline=baselineCoverage(),rig=productionRigCoverage(),provider=read('data/real-device-provider.json',{}),device=read('WORLD_DEVICE_PROFILE_MATRIX.json',{});
 const productionCertification=evaluateProductionCertification({baseline,rig,deviceProviderConfigured:String(provider.status||'').toUpperCase()==='CONFIGURED',deviceEvidencePercent:device.percent,devicePhysicalProvider:device?.evidence?.physicalProviderRuntimeVerified===true||device?.evidence?.physicalProvider===true,requiredCiPass:String(process.env.WQA_REQUIRED_CI_PASS||'').toLowerCase()==='true'});
 const readinessPercent=certifiedReadiness(r.overall,productionCertification);
 const report={schemaVersion:'6.1.0',system:'WORLD_QUALITY_AUTOPILOT',generatedAt:new Date().toISOString(),readinessPercent,diagnosticReadinessPercent:r.overall,domainPercent:r.scores,hardGateReady:readinessPercent>=+(p.release?.minimumSystemReadiness||85),structuralTargetPercent:99,productionProofTargetPercent:100,production100Certified:productionCertification.ready,productionEvidencePercent:productionCertification.evidencePercent,productionCertification,blockers,evidence:Object.fromEntries(Object.entries(d).map(([k,v])=>[k,v.map(c=>({id:c.id,ok:c.ok,weight:c.weight}))]))};
 fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_AUTOPILOT_REPORT.json'),JSON.stringify(report,null,2)+'\n');return report
}
if(require.main===module){const r=analyze();console.log(`[WORLD_QUALITY_AUTOPILOT_V6_1] readiness ${r.readinessPercent}% (diagnostic ${r.diagnosticReadinessPercent}%, production100=${r.production100Certified?'CERTIFIED':'BLOCKED'})`);for(const[k,v]of Object.entries(r.domainPercent))console.log(`  ${k}: ${v}%`);if(r.productionCertification?.blockers?.length)console.log(`  100% blockers: ${r.productionCertification.blockers.join(', ')}`);if(!r.hardGateReady)process.exitCode=1}
module.exports={analyze,checksForDomain,computeReadiness,weightedScore,baselineCoverage,isSyntheticEvidence,isProductionRigSample,productionRigCoverage,evaluateProductionCertification,certifiedReadiness};
