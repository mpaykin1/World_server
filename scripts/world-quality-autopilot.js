#!/usr/bin/env node
'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path'),ROOT=process.cwd();
function run(s,a=[]){const p=path.join(ROOT,'scripts',s);if(!fs.existsSync(p))return{skipped:true};console.log(`\n[WORLD_QUALITY_AUTOPILOT_V4] ${s}`);cp.execFileSync(process.execPath,[p,...a],{stdio:'inherit'});return{ok:true}}
function branch(){try{return cp.execFileSync('git',['branch','--show-current'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{return''}}
const args=new Set(process.argv.slice(2));
for(const s of[
 'world-animation-semantic-validator.js','world-retarget-contract.js','world-runtime-quality-profiler.js','world-visual-baseline-candidates.js',
 'world-semantic-detail-indexer.js','world-material-synthesis.js','world-device-profile-matrix.js','world-visibility-optimizer.js',
 'world-microdetail-audit.js',
 'world-feedback-learner.js','world-candidate-lab.js','world-quality-analyzer.js','world-detail-planner.js','world-quality-scheduler.js','world-quality-evidence-ledger.js'
])run(s);
if(args.has('--full'))for(const s of['technology-runtime-health.js','ai-visual-critic.js','quality-risk-predictor.js','quality-root-cause.js','quality-cost-optimizer.js','quality-regression-gate.js'])run(s);
if(args.has('--evolve')){const b=branch();if(!b||['master','main'].includes(b)){console.error('[WQA_V4] --evolve forbidden on master/main');process.exit(2)}for(const s of['world-feedback-learner.js','world-candidate-lab.js','quality-root-cause.js','generate-regression-tests.js','quality-patch-synthesizer.js','quality-patch-tournament.js','quality-regression-gate.js'])run(s)}
const read=(p)=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,p),'utf8'))}catch{return null}};
const report=read('WORLD_QUALITY_AUTOPILOT_REPORT.json')||{},plan=read('WORLD_QUALITY_AUTOPILOT_PLAN.json')||{},runtime=read('WORLD_RUNTIME_QUALITY_REPORT.json'),device=read('WORLD_DEVICE_PROFILE_MATRIX.json'),ledger=read('WORLD_QUALITY_EVIDENCE_LEDGER.json'),materials=read('WORLD_MATERIAL_SYNTHESIS_REPORT.json'),visibility=read('WORLD_VISIBILITY_OPTIMIZER_REPORT.json'),microdetail=read('WORLD_MICRODETAIL_REPORT.json'),retarget=read('WORLD_RETARGET_CONTRACT_REPORT.json'),scheduler=read('WORLD_QUALITY_SCHEDULER_REPORT.json'),lab=read('WORLD_CANDIDATE_LAB_REPORT.json'),learner=read('WORLD_FEEDBACK_LEARNER_REPORT.json');
const status={schemaVersion:'4.0.0',generatedAt:new Date().toISOString(),readinessPercent:report.readinessPercent,domainPercent:report.domainPercent,hardGateReady:report.hardGateReady,runtimeQualityPercent:runtime?.percent??null,deviceEvidencePercent:device?.percent??null,evidenceLedgerSha256:ledger?.ledgerSha256??null,materialProfiles:materials?.profiles??null,visibilityPercent:visibility?.percent??null,microdetailPercent:microdetail?.percent??null,microdetailSchemaVersion:microdetail?.schemaVersion??null,retargetContractReady:retarget?.contractReady??false,schedulerRoutes:scheduler?.routes?.length??0,candidateCount:lab?.candidateCount??0,feedbackSamples:learner?.samples??0,nextSystems:(plan.actions||[]).slice(0,8),mode:args.has('--evolve')?'candidate-evolution':args.has('--full')?'full-diagnostics':'safe-analysis'};
fs.writeFileSync(path.join(ROOT,'WORLD_QUALITY_AUTOPILOT_STATUS.json'),JSON.stringify(status,null,2)+'\n');console.log(`[WQA_V4] complete ${status.readinessPercent}%`);
