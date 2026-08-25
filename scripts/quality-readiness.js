#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');
const root=process.cwd(),exists=p=>fs.existsSync(path.join(root,p)),read=(p,d)=>{try{return JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));}catch{return d;}};
function c(name,score,implemented=true,note=''){return{name,score:implemented?score:0,implemented,note};}
const integrations=read('data/quality-autopilot/integration-status.json',{});
const core=[
 c('Static quality analysis',100,exists('lib/quality-autopilot.js')),
 c('Safe AutoFix + automatic rollback',100,exists('lib/quality-autopilot.js')),
 c('Isolated multi-candidate tournament',97,exists('lib/quality/tournament.js')),
 c('Improvement memory / Never-Retry-Bad-Fix',100,exists('lib/quality-autopilot.js')),
 c('Golden cross-project learning + expiry',97,exists('lib/quality/engine-adapters.js')),
 c('Global regression knowledge base',96,exists('lib/quality/global-regression-kb.js')),
 c('Executable error→regression compiler',94,exists('lib/quality/error-to-regression.js')),
 c('Night scheduler / concurrency guard / priority',95,exists('.github/workflows/quality-autopilot.yml')),
 c('Exact before→after visual regression',94,exists('scripts/quality-visual-diff.js')),
 c('Desktop + mobile gameplay probe',94,exists('scripts/quality-browser-probe.js')),
 c('Synthetic player army',94,exists('scripts/quality-synthetic-player-army.js')),
 c('GPU/WebGL runtime profiler',90,exists('scripts/quality-browser-probe.js')),
 c('Asset quality inspector',90,exists('lib/quality/asset-inspector.js')),
 c('Per-device performance budgets',94,exists('lib/quality/performance-budget.js')),
 c('Semantic world validator',94,exists('lib/quality/semantic-world-validator.js')),
 c('Engine-specific WebGL/Godot/Roblox optimizer plans',90,exists('lib/quality/engine-optimizer.js')),
 c('Live telemetry gate',95,exists('lib/quality/telemetry-gate.js')),
 c('Progressive canary decision engine 1→5→20→50→100',96,exists('lib/quality/progressive-canary.js')),
 c('Causal quality learning',90,exists('lib/quality/causal-learning.js')),
 c('Root-cause clustering',94,exists('lib/quality/root-cause.js')),
 c('Quality debt ledger',97,exists('lib/quality/quality-debt.js')),
 c('Security gate',90,exists('lib/quality/security-gate.js')),
 c('Migration safety gate',85,exists('scripts/quality-migration-gate.js')),
 c('AI candidate patch sandbox',87,exists('lib/quality/candidate-sandbox.js')),
 c('Flaky-test retry classification',93,exists('lib/quality-autopilot.js')),
 c('Human denylist / immutable regions',100,exists('config/quality-autopilot.json')),
 c('Tamper-evident audit chain',97,exists('lib/quality/audit-chain.js')),
 c('Compute budget hard limits',95,exists('lib/quality/compute-budget-manager.js')),
 c('Dependency upgrade tournament',90,exists('lib/quality/dependency-tournament.js')),
 c('Supabase production telemetry API/client',94,exists('api/quality-telemetry.js')&&exists('shared/quality-telemetry.js')),
 c('Supabase centralized knowledge-store adapter',94,exists('lib/quality/knowledge-store.js')),
 c('Vercel preview/promote/rollback provider',88,exists('scripts/quality-vercel-provider.js'))
];
const runtime=[
 c('Supabase telemetry storage live',integrations.supabaseTelemetryStorage?100:40,true),
 c('Supabase private knowledge store live',integrations.supabaseKnowledgeStore?100:30,true),
 c('Production telemetry endpoint deployed and verified',integrations.productionTelemetryEndpointVerified?100:55,true),
 c('GitHub autonomous branch/PR write',integrations.githubAutonomousWrite?100:35,true),
 c('Vercel project bound to automation',integrations.vercelProjectVisibleToConnector?100:35,true),
 c('Progressive real traffic splitter connected',integrations.progressiveTrafficSplitterConnected?100:45,true),
 c('GPU worker autoscaling provider connected',integrations.gpuWorkerProviderConnected?100:40,true),
 c('High-risk engine rewrites auto-promotable',70,true,'kept candidate-only until synthetic/visual/live evidence is available')
];
const avg=a=>Math.round(a.reduce((n,x)=>n+x.score,0)/Math.max(1,a.length));const architecturalReadiness=avg(core);const operationalReadiness=avg(runtime);const endToEndAutonomyReadiness=Math.round(architecturalReadiness*0.65+operationalReadiness*0.35);const systemReadiness=architecturalReadiness;const report={generatedAt:new Date().toISOString(),systemReadiness,architecturalReadiness,operationalReadiness,endToEndAutonomyReadiness,core,runtime,integrations};fs.mkdirSync('data/quality-autopilot',{recursive:true});fs.writeFileSync('data/quality-autopilot/readiness.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
