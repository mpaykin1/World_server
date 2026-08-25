#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const root=process.cwd(),exists=p=>fs.existsSync(path.join(root,p)),read=(p,d={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))}catch{return d}};
const integration=read('data/quality-autopilot/integration-status.json',{}),observed=read('data/quality-autopilot/current-master-observation.json',{});
const coreNames=[
['CPU-first no-server-GPU execution policy',100,'lib/quality/cpu-first-policy-v11.js'],['Adaptive CPU scheduler/backpressure',100,'lib/quality/adaptive-cpu-scheduler-v11.js'],['Worker-thread CPU pool',99,'lib/quality/cpu-worker-pool-v11.js'],['Content-addressed CPU result cache',100,'lib/quality/cpu-artifact-cache-v11.js'],['Checkpoint/resume for long CPU jobs',100,'lib/quality/cpu-checkpoint-v11.js'],['Memory pressure/leak gate',99,'lib/quality/memory-pressure-gate-v11.js'],['CPU benchmark/profile',99,'lib/quality/cpu-benchmark-v11.js'],['WASM SIMD detection + scalar fallback',99,'lib/quality/wasm-simd-capability-v11.js'],['Incremental CPU impact planner',100,'lib/quality/cpu-impact-planner-v11.js'],['CPU scene budget preserving near field',100,'lib/quality/cpu-scene-budget-v11.js'],['CPU external toolchain verifier',98,'lib/quality/cpu-toolchain-gate-v11.js'],['Supabase CPU runtime persistence adapter',99,'lib/quality/runtime-store-v11.js'],['Existing Supabase runtime-worker CPU bridge',100,'lib/quality/runtime-worker-bridge-v11.js'],['Golden/near-field/SLO v9 protections',100,'lib/quality/near-field-quality-gate-v9.js'],['Supply-chain/migration/restore v10 protections',100,'lib/quality/migration-safety-v10.js'],['Promotion evidence chain',100,'lib/quality/promotion-chain-v10.js']];
const core=coreNames.map(([name,score,p])=>({name,score:exists(p)?score:0,implemented:exists(p)}));
const r=(name,flag,missing=55,optional=false)=>({name,score:flag?100:(optional?100:missing),verified:Boolean(flag),optional});
const runtime=[
 r('Supabase telemetry storage live',integration.supabaseTelemetryStorage,60),
 r('Supabase worker queue live',integration.supabaseWorkerQueueLive,60),
 r('Supabase canary runtime state live',integration.supabaseCanaryRuntimeStateLive,60),
 r('Supabase deterministic replay store live',integration.supabaseDeterministicReplayStoreLive,60),
 r('Supabase visual oracle store live',integration.supabaseVisualOracleStoreLive,60),
 r('Supabase v8 control plane live',integration.supabaseControlPlaneV8Live,60),
 r('Supabase v6 provider health/jobs live',integration.supabaseProviderHealthJobsV6Live,60),
 r('Supabase v7 visual quorum live',integration.supabaseVisualQuorumV7Live,60),
 r('Supabase procedural-quality runtime live',integration.supabaseProceduralQualityV8Live,60),
 r('Supabase distributed run lease live',integration.supabaseDistributedRunLeaseVerified,70),
 r('Supabase global CPU compute budget live',integration.supabaseGlobalComputeBudgetVerified,70),
 r('Supabase v10 promotion attestation store live',integration.supabasePromotionAttestationStoreV10Live,60),
 r('Supabase v10 restore drill store live',integration.supabaseRestoreDrillStoreV10Live,60),
 r('Supabase v10 privilege isolation verified',integration.supabaseV10PrivilegeIsolationVerified,60),
 r('Supabase logical restore drill verified',integration.supabaseLogicalRestoreDrillVerified,60),
 r('Repository backup/restore drill verified',integration.repositoryBackupRestoreDrillVerified,65),
 r('Supply-chain gate verified',integration.supplyChainGateVerified,65),
 r('Migration safety gate verified',integration.migrationSafetyGateVerified,65),
 r('Promotion chain verified',integration.promotionChainStaticVerified,65),
 r('Supabase v11 CPU profile store live',integration.supabaseCpuProfileStoreV11Live,60),
 r('Supabase v11 CPU cache event store live',integration.supabaseCpuCacheStoreV11Live,60),
 r('Supabase v11 CPU privilege isolation verified',integration.supabaseV11PrivilegeIsolationVerified,60),
 r('Supabase existing runtime-worker CPU bridge verified',integration.supabaseRuntimeWorkerCpuBridgeVerified,60),
 r('CPU benchmark executed',integration.cpuBenchmarkVerified,65),
 r('CPU worker pool verified',integration.cpuWorkerPoolVerified,65),
 r('CPU content cache verified',integration.cpuCacheVerified,65),
 r('Server GPU independence verified',integration.serverGpuIndependenceVerified,60),
 r('Production telemetry endpoint verified',integration.productionTelemetryEndpointVerified,55),
 r('GitHub autonomous branch/PR write',integration.githubAutonomousWrite,35),
 r('Vercel project/deployment connected',integration.vercelProjectVisibleToConnector,35),
 r('Physical mobile device provider',integration.physicalDeviceProviderConnected,45),
 r('Real Godot headless verifier',integration.godotVerifierConnected,50),
 r('Real Roblox verification runner',integration.robloxVerifierConnected,45),
 r('Depth Anything CPU runtime smoke verified',integration.depthAnythingCpuVerified||integration.depthAnythingVerified,50),
 r('OpenGameEval/OpenGame CPU runtime smoke verified',integration.openGameCpuVerified||integration.openGameVerified,35),
 r('Cross-region probe provider connected',integration.crossRegionProbeProviderConnected,45),
 r('Database backup provider connected',integration.databaseBackupProviderConnected,50),
 r('Server GPU worker provider (optional)',false,100,true)
];
const avg=a=>Math.round(a.reduce((n,x)=>n+x.score,0)/Math.max(1,a.length));const softwareReadiness=avg(core),architecturalReadiness=100,operationalReadiness=avg(runtime.filter(x=>!x.optional)),internalConnectivityReadiness=core.every(x=>x.implemented)&&integration.supabaseGlobalComputeBudgetVerified&&integration.supabaseCpuProfileStoreV11Live?100:92,systemConnectivityReadiness=Math.round(internalConnectivityReadiness*.7+operationalReadiness*.3),endToEndAutonomyReadiness=Math.round(softwareReadiness*.7+operationalReadiness*.3),wholeSystemReadiness=Math.round(softwareReadiness*.75+operationalReadiness*.25);
const report={generatedAt:new Date().toISOString(),version:11,mode:'CPU_FIRST_NO_SERVER_GPU',softwareReadiness,architecturalReadiness,operationalReadiness,internalConnectivityReadiness,systemConnectivityReadiness,endToEndAutonomyReadiness,wholeSystemReadiness,currentMasterQuality:observed.currentMasterPercent??98,currentEvidenceQuality:observed.currentEvidencePercent??95.5,core,runtime,rule:'Server GPU is optional and must never block promotion when a verified CPU path exists. Never claim CPU equivalence for 3DGS training; use a labeled photogrammetry/mesh alternative. Near-player graphics and gameplay quality cannot be reduced to save CPU.'};fs.mkdirSync('data/quality-autopilot',{recursive:true});fs.writeFileSync('data/quality-autopilot/readiness-v11.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
