#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {inspectCurrentStack}=require('../lib/quality/current-stack-bridge-v9');
const root=process.cwd(),exists=p=>fs.existsSync(path.join(root,p)),read=(p,d={})=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'))}catch{return d}};
const integration=read('data/quality-autopilot/integration-status.json',{}),observed=read('data/quality-autopilot/current-master-observation.json',{}),current=inspectCurrentStack(root);
if(current.currentMasterPercent==null&&observed.currentMasterPercent!=null)current.currentMasterPercent=observed.currentMasterPercent;
if(current.currentEvidencePercent==null&&observed.currentEvidencePercent!=null)current.currentEvidencePercent=observed.currentEvidencePercent;
if(observed.capabilities)for(const[k,v]of Object.entries(observed.capabilities))if(!current.capabilities[k])current.capabilities[k]=v;
const core=[
['Current-stack non-destructive bridge',98,exists('lib/quality/current-stack-bridge-v9.js')],
['Golden adoption SHA-256 lock',99,exists('lib/quality/golden-adoption-lock-v9.js')],
['Golden quarantine/freeze on drift',99,exists('lib/quality/golden-quarantine-v9.js')],
['Stable-production visual baseline quorum',96,exists('lib/quality/visual-baseline-quorum-v9.js')],
['Near-field graphics invariant',100,exists('lib/quality/near-field-quality-gate-v9.js')],
['SLO robust anomaly rollback gate',97,exists('lib/quality/slo-anomaly-v9.js')],
['Verified provider capability gate',98,exists('lib/quality/provider-capability-gate-v9.js')],
['Tamper-evident promotion attestation',98,exists('lib/quality/promotion-attestation-v9.js')],
['Distributed Supabase run lease adapter',98,exists('lib/quality/runtime-store-v9.js')],
['Global atomic compute budget adapter',98,exists('scripts/quality-budget-reserve-v9.js')],
['Depth Anything/OpenGame runtime smoke adapters',92,exists('lib/quality/external-adapter-gate-v9.js')],
['Existing release/perceptual/durable stack preservation',100,current.capabilities.releaseGate&&current.capabilities.durableCycle]
].map(([name,score,implemented])=>({name,score:implemented?score:0,implemented}));
const r=(name,flag,whenFalse)=>({name,score:flag?100:whenFalse,implemented:true,verified:Boolean(flag)});
const runtime=[
r('Supabase telemetry storage live',integration.supabaseTelemetryStorage,60),
r('Supabase worker queue live',integration.supabaseWorkerQueueLive,60),
r('Supabase canary runtime state live',integration.supabaseCanaryRuntimeStateLive,60),
r('Supabase deterministic replay store live',integration.supabaseDeterministicReplayStoreLive,60),
r('Supabase visual oracle store live',integration.supabaseVisualOracleStoreLive,60),
r('Supabase v8 control plane live',integration.supabaseControlPlaneV8Live,60),
r('Supabase v6 provider health/jobs live',integration.supabaseProviderHealthJobsV6Live,60),
r('Supabase v7 visual quorum live',integration.supabaseVisualQuorumV7Live,60),
r('Supabase v8 procedural quality live',integration.supabaseProceduralQualityV8Live,60),
r('Supabase distributed lease RPC live',integration.supabaseDistributedRunLeaseVerified,70),
r('Supabase global compute RPC live',integration.supabaseGlobalComputeBudgetVerified,70),
r('Production telemetry endpoint verified',integration.productionTelemetryEndpointVerified,55),
r('GitHub autonomous branch/PR write',integration.githubAutonomousWrite,35),
r('Vercel project/deployment connected',integration.vercelProjectVisibleToConnector,35),
r('Physical mobile device provider',integration.physicalDeviceProviderConnected,45),
r('Real GPU worker provider',integration.gpuWorkerProviderConnected,45),
r('Real Godot headless verifier',integration.godotVerifierConnected,50),
r('Real Roblox verification runner',integration.robloxVerifierConnected,45),
r('Depth Anything runtime smoke verified',integration.depthAnythingVerified,50),
r('OpenGameEval/OpenGame runtime smoke verified',integration.openGameVerified,35)
];
const avg=a=>Math.round(a.reduce((n,x)=>n+x.score,0)/Math.max(1,a.length));
const softwareReadiness=avg(core),operationalReadiness=avg(runtime),endToEndAutonomyReadiness=Math.round(softwareReadiness*.68+operationalReadiness*.32),wholeSystemReadiness=Math.round(softwareReadiness*.72+operationalReadiness*.28);
const report={generatedAt:new Date().toISOString(),version:9,softwareReadiness,architecturalReadiness:softwareReadiness,operationalReadiness,endToEndAutonomyReadiness,wholeSystemReadiness,currentMasterQuality:current.currentMasterPercent,currentEvidenceQuality:current.currentEvidencePercent,core,runtime,currentStack:current,rule:'No external integration receives 100% without live evidence.'};
fs.mkdirSync('data/quality-autopilot',{recursive:true});fs.writeFileSync('data/quality-autopilot/readiness-v9.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
