#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const {ROOT,STATE_DIR,ensureDir,readJSON,writeJSON,nowIso}=require('./integration-utils.cjs');
const spatial=require('./character-spatial-contract-lib.cjs');
const dir=path.join(STATE_DIR,`selftest-${process.pid}`);ensureDir(dir);const db=path.join(dir,'queue.sqlite');
function run(args,expect=0){try{return {code:0,out:cp.execFileSync(process.execPath,args,{cwd:ROOT,encoding:'utf8',env:{...process.env,WORLD_SERVER_QUEUE_DB:db,NODE_NO_WARNINGS:'1'}})}}catch(e){const code=Number.isInteger(e.status)?e.status:1;if(code!==expect)throw e;return{code,out:String(e.stdout||'')}}}
const checks=[];function check(id,ok,details){checks.push({id,pass:Boolean(ok),details:details??null})}
try{
 const enq=JSON.parse(run(['scripts/durable-job-queue.cjs','enqueue','selftest','{"x":1}','9','2']).out),id=enq.id;
 const c1=JSON.parse(run(['scripts/durable-job-queue.cjs','claim','selftest-A','60000']).out);check('queue-priority-claim',c1?.id===id&&c1?.priority===9);
 run(['scripts/durable-job-queue.cjs','heartbeat',id,'selftest-A','{"checkpoint":1}','60000']);run(['scripts/durable-job-queue.cjs','fail',id,'selftest-A','retry','0']);const c2=JSON.parse(run(['scripts/durable-job-queue.cjs','claim','selftest-A','60000']).out);run(['scripts/durable-job-queue.cjs','fail',id,'selftest-A','dead','0']);const dead=JSON.parse(run(['scripts/durable-job-queue.cjs','health']).out);check('queue-dlq',Number(dead.counts?.dead||0)===1);
 run(['scripts/durable-job-queue.cjs','retry-dead',id]);const c3=JSON.parse(run(['scripts/durable-job-queue.cjs','claim','selftest-B','60000']).out);run(['scripts/durable-job-queue.cjs','ack',id,'selftest-B','{"ok":true}']);const done=JSON.parse(run(['scripts/durable-job-queue.cjs','health']).out);check('queue-checkpoint-retry-ack',c2?.id===id&&c3?.id===id&&Number(done.counts?.done||0)===1);
 const idem=JSON.parse(run(['scripts/durable-job-queue.cjs','enqueue','same','{"b":2,"a":1}','0','3']).out),idem2=JSON.parse(run(['scripts/durable-job-queue.cjs','enqueue','same','{"a":1,"b":2}','0','3']).out);check('queue-idempotency-canonical-json',idem.id===idem2.id);
 const requiredReports=[['integration-gate','SYSTEM_INTEGRATION_REPORT.json'],['dr-verified','DISASTER_RECOVERY_VERIFY_REPORT.json'],['policy-pass','POLICY_DECISION_REPORT.json'],['project-directives','PROJECT_DIRECTIVE_REPORT.json'],['technology-lock','TECHNOLOGY_LOCK_REPORT.json'],['graphics-ratchet','GRAPHICS_REGRESSION_GUARD_REPORT.json'],['audio-variation','AUDIO_VARIATION_REPORT.json'],['gameplay-contract','GAMEPLAY_PHYSICAL_CONTRACT_REPORT.json'],['desktop-ai-report','DESKTOP_AI_REPORT_VALIDATION.json'],['asset-batching','ASSET_INGESTION_PLAN.json'],['sbom','SBOM_STATUS.json'],['update-trust','UPDATE_TRUST_STATUS.json'],['feature-flags','FEATURE_FLAG_STATUS.json'],['config-contract','CONFIG_CONTRACT_STATUS.json'],['adapter-sandbox','ADAPTER_SANDBOX_STATUS.json'],['reproducible-build','REPRODUCIBLE_BUILD_STATUS.json'],['chaos-safety','INTEGRATION_CHAOS_REPORT.json'],['enhancement','SYSTEM_ENHANCEMENT_BACKLOG.json'],['supply-chain','SUPPLY_CHAIN_SIGNATURE_STATUS.json'],['model-check','MODEL_CHECK_REPORT.json'],['distributed-cas','DISTRIBUTED_CAS_STATUS.json'],['semantic-graph','SEMANTIC_DEPENDENCY_GRAPH.json'],['device-lab','DEVICE_LAB_STATUS.json'],['wit-component','WIT_COMPONENT_STATUS.json'],['toolchain','TOOLCHAIN_BOOTSTRAP_STATUS.json'],['toolchain-security','TOOLCHAIN_SECURITY_REPORT.json'],['native-ast','NATIVE_AST_DATAFLOW_REPORT.json'],['rekor-monitor','REKOR_MONITOR_REPORT.json'],['cas-discovery','CAS_DISCOVERY_STATUS.json'],['device-executor','DEVICE_EXECUTOR_STATUS.json'],['wit-bindings','WIT_BINDINGS_STATUS.json'],['orchestrator-monitor','ORCHESTRATOR_MONITOR_LIFECYCLE_STATUS.json'],['orchestrator-patch-safety','ORCHESTRATOR_PATCH_SAFETY_STATUS.json'],['orchestrator-minimal-repro-health','ORCHESTRATOR_MINIMAL_REPRO_STATUS.json'],['orchestrator-invariant-model','ORCHESTRATOR_INVARIANT_MODEL_REPORT.json']];
 for(const [id2,file] of requiredReports)check(id2,readJSON(path.join(ROOT,file),{}).pass===true,file);
 const prov=readJSON(path.join(ROOT,'SLSA_PROVENANCE.intoto.json'),{});check('provenance-v1',prov._type==='https://in-toto.io/Statement/v1'&&prov.predicateType==='https://slsa.dev/provenance/v1');
 const graph=readJSON(path.join(ROOT,'DEPENDENCY_GRAPH.json'),{});check('dependency-merkle',typeof graph.merkleRoot==='string'&&graph.merkleRoot.length===64);
 const tel=readJSON(path.join(ROOT,'INTEGRATION_TELEMETRY_STATUS.json'),{});check('telemetry-local',tel.pass===true&&tel.w3cTraceContext===true&&tel.otlpHttpJson===true);
 const f=spatial.feetForwardFromTravel({x:3,y:0,z:0});check('feet-follow-travel',spatial.dot(f,{x:1,y:0,z:0})>.999);
 const a=spatial.attackDirectionFromFeet(f);check('attack-follows-feet',spatial.dot(a,f)>.999);
 const torso={x:0,y:1,z:0},enemy={x:0,y:1,z:5},shield=spatial.shieldPoint(torso,enemy,.5);check('shield-between-enemy-torso',spatial.isBetween(shield,torso,enemy,.001));
 check('pistol-one-hand',spatial.validateGrip('pistol',['right'])&&!spatial.validateGrip('pistol',['right','left']));
 check('automatic-two-hands',spatial.validateGrip('rifle',['right','left'])&&spatial.validateGrip('machinegun',['right','left'])&&!spatial.validateGrip('machinegun',['right']));
}finally{try{fs.rmSync(dir,{recursive:true,force:true})}catch{}}
 const flag=require('./feature-flag-engine.cjs');check('openfeature-safety-lock',flag.evaluate('adapter.untrustedExecution',{targetingKey:'selftest'},true).value===false);
 const sb=require('./adapter-sandbox.cjs');let denied=false;try{sb.build('../outside.wasm')}catch{denied=true}check('sandbox-path-escape',denied);

 const sigSelf=JSON.parse(run(['scripts/artifact-signing-transparency.cjs','selftest']).out);check('signature-mutant-rejection',sigSelf.validAccepted===true&&sigSelf.mutantRejected===true);
 const mc=require('./model-state-checker.cjs');check('model-mutant-rejection',!mc.queueModel(true).pass&&!mc.controlModel(true).pass);
 const sg=require('./semantic-dependency-graph.cjs');const parsed=sg.parse('x.js','function alpha(){} const y = alpha();');check('semantic-symbol-parser',parsed.definitions.some(x=>x.name==='alpha')&&parsed.assignments.some(x=>x.sourceCall==='alpha'&&x.target==='y'));
 const dcas=require('./distributed-cas.cjs');let casMismatch=false;try{dcas.putLocal(Buffer.from('x'),'0'.repeat(64))}catch{casMismatch=true}check('distributed-cas-digest-rejection',casMismatch);
 const dl=require('./device-lab-orchestrator.cjs');check('real-device-emulator-not-real',dl.parseAdb('List of devices attached\nemulator-5554 device product:x\nABC123 device product:y\n').filter(x=>x.real).length===1);
 const wit=require('./wit-component-validator.cjs');check('wit-negative-rejection',wit.embedded('world bad {}').length>0);


 const sec=require('./toolchain-security-gate.cjs');check('cosign-security-floor',sec.gte('3.1.3','3.1.3')&&!sec.gte('3.1.2','3.1.3'));
 const tb=require('./toolchain-bootstrap.cjs');check('toolchain-semver-floor',tb.gte('3.2.0','3.1.3')&&!tb.gte('3.1.2','3.1.3'));
 const wb=require('./wit-bindings-generator.cjs');const b1=wb.generate('world world-server-adapter {}'),b2=wb.generate('world world-server-adapter {}');check('wit-bindings-deterministic',b1===b2&&b1.includes('QualityAdapter'));
 const sup=require('./orchestrator-supervisor.cjs');check('supervisor-crash-loop',sup.crashLoop([1000,2000,3000,4000,5000],5000)===true&&sup.nextBackoff(3)>sup.nextBackoff(2));
 const oml=require('./orchestrator-monitor-lifecycle.cjs');check('orchestrator-monitor-generation',oml.selftest().pass===true);
 const omr=require('./orchestrator-minimal-repro.cjs');check('orchestrator-minimal-repro',omr.selftest().pass===true);
 const ops=require('./orchestrator-patch-safety-gate.cjs');check('orchestrator-bad-patch-rejected',ops.selftest().pass===true);
 const oim=require('./orchestrator-invariant-model.cjs');check('orchestrator-model-mutant-rejected',oim.explore().pass===true);
 const sched=require('./capability-aware-scheduler.cjs');check('scheduler-capability-match',sched.matches({capabilities:{gpu:false},resources:{cpuCores:2}},{gpu:false},{cpuCores:4})===true&&sched.matches({capabilities:{gpu:true}},{gpu:false},{cpuCores:4})===false);
 const casr=require('./cas-redundancy-verifier.cjs');check('cas-two-root-recovery',casr.verify().pass===true);
 const rr=require('./deterministic-record-replay.cjs');check('deterministic-record-replay',rr.selftest().pass===true);
 const dsec=require('./dependency-security-orchestrator.cjs');check('osv-engine-health',dsec.health().pass===true);
 const txd=require('./transactional-deploy.cjs');check('transactional-deploy-health',txd.health().pass===true&&txd.health().rollbackOnFailure===true);
 const dws=require('./device-worker-server.cjs');check('device-worker-no-arbitrary-shell',dws.health().pass===true&&dws.health().allowArbitraryCommands===false);



 check('v7.3-impact-routing-engine',fs.existsSync(path.join(ROOT,'scripts/change-impact-orchestrator.cjs'))&&fs.readFileSync(path.join(ROOT,'scripts/change-impact-orchestrator.cjs'),'utf8').includes('executionPolicy'));
 check('v7.3-impact-full-gate',fs.readFileSync(path.join(ROOT,'scripts/change-impact-orchestrator.cjs'),'utf8').includes('full-release-gate'));
 check('v7.3-readiness-evidence-score',fs.readFileSync(path.join(ROOT,'scripts/system-readiness.cjs'),'utf8').includes('evidenceConfidencePercent'));
 check('v7.3-readiness-truth-separation',fs.readFileSync(path.join(ROOT,'scripts/system-readiness.cjs'),'utf8').includes('overallOperationalReadinessPercent'));
 check('v7.3-function-coverage-engine',fs.existsSync(path.join(ROOT,'scripts/function-contract-coverage.cjs')));
 check('v7.3-function-coverage-no-autocert',fs.readFileSync(path.join(ROOT,'scripts/function-contract-coverage.cjs'),'utf8').includes('NEEDS_EXPLICIT_EVIDENCE_CONTRACT'));
 check('v7.3-native-truth-separation',fs.readFileSync(path.join(ROOT,'scripts/system-readiness.cjs'),'utf8').includes('nativeExtensionCoveragePercent'));
 check('v7.3-native-truth-external-blockers',fs.readFileSync(path.join(ROOT,'scripts/system-readiness.cjs'),'utf8').includes('externalBlockers'));
 const leaseSql=fs.readFileSync(path.join(ROOT,'supabase/migrations/20260824_orchestrator_leader_lease.sql'),'utf8');
 check('v7.3-supabase-lease-security-invoker',leaseSql.includes('security invoker')&&!leaseSql.includes('security definer'));
 check('v7.3-supabase-lease-rls-revoke',leaseSql.includes('enable row level security')&&leaseSql.includes('revoke execute')&&leaseSql.includes('to service_role'));


 const lef=require('./legacy-evidence-factory.cjs');check('v7.4-legacy-evidence-factory',lef.selftest().pass===true&&lef.selftest().negativeNameOnlyBlocked===true);
 const slo=require('./slo-error-budget-controller.cjs');const sloGood=slo.evaluate(Array.from({length:30},()=>({ok:true,durationMs:100}))),sloBad=slo.evaluate(Array.from({length:30},(_,i)=>({ok:i<20,durationMs:i<20?100:2500})));check('v7.4-slo-error-budget',sloGood.action==='ALLOW_CANARY'&&sloBad.action==='STOP_CANARY_AND_ROLLBACK');
 const mig=require('./database-migration-coordinator.cjs');check('v7.4-db-migration-coordinator',mig.health().pass===true&&!mig.validatePlan({phases:[{phase:'expand',sql:'drop table x;'},{phase:'migrate',sql:'select 1;'}]}).pass&&!mig.validatePlan({phases:[{phase:'expand',sql:"create extension vector version '0.7.0';"},{phase:'migrate',sql:'select 1;'}]}).pass);
 const delta=require('./asset-delta-distributor.cjs');check('v7.4-asset-delta',delta.selftest().pass===true&&delta.selftest().corruptChunkRejected===true);
 const causal=require('./causal-debugger.cjs');const cg=causal.graph([{type:'a',file:'a',data:{traceId:'t'}},{type:'b',file:'b',data:{traceId:'t'}}]);check('v7.4-causal-debugger',causal.health().pass===true&&cg.edges.length===1&&causal.redact({token:'secret'}).token==='[REDACTED]');
 check('v7.4-supabase-extension-version-guard',fs.readFileSync(path.join(ROOT,'scripts/database-migration-coordinator.cjs'),'utf8').includes('extension-version-pinning-deprecated'));


 const crs=JSON.parse(run(['scripts/cas-replication-controller.cjs']).out); check('v75-cas-replication-read-repair',crs.pass&&crs.protocolSelftest?.readRepair===true,crs.protocolSelftest);
 const pds=JSON.parse(run(['scripts/physical-device-fleet.cjs']).out); check('v75-device-fleet-protocol',pds.pass&&pds.protocolSelftest?.evidenceVerified===true,pds.protocolSelftest);
 const psa=require('./production-slo-autopilot.cjs'); const psah=psa.health(); check('v75-production-slo-truth-barrier',psah.pass&&psah.controllerSelftest.synthetic.decision==='DRY_RUN_ROLLBACK_ONLY',psah.controllerSelftest);
 const mf=require('./migration-fencing-verifier.cjs'); const mfs=mf.selftest(); check('v75-migration-fencing-stale-rejected',mfs.pass&&!mfs.stale.pass,mfs);
 const lss=JSON.parse(run(['scripts/long-soak-runner.cjs','selftest']).out); check('v75-long-soak-harness',lss.pass&&lss.smokeHarnessVerified&&!lss.longSoakCertified,lss);
 const nc=require('./native-causal-collector.cjs'); const ncs=nc.selftest(); check('v75-native-causal-correlation',ncs.pass&&ncs.traceCorrelation,ncs);

const failed=checks.filter(x=>!x.pass),report={schemaVersion:'7.5.0',generatedAt:nowIso(),pass:failed.length===0,passed:checks.length-failed.length,total:checks.length,checks};writeJSON(path.join(ROOT,'INTEGRATION_SELFTEST_REPORT.json'),report);console.log(`[INTEGRATION_SELFTEST_V75] ${report.pass?'PASS':'FAIL'} ${report.passed}/${report.total}`);if(!report.pass)process.exitCode=2;
