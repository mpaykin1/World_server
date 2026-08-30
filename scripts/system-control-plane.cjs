#!/usr/bin/env node
'use strict';
const cp=require('child_process'),path=require('path');
const {ROOT,writeJSON,nowIso}=require('./integration-utils.cjs');
const {startSpan}=require('./integration-telemetry-lib.cjs');
(async()=>{
  const verify=process.argv.includes('--verify');
  const root=startSpan('world-server.integration.control-plane',{mode:verify?'verify':'full',cpuFirst:true,policyVersion:'7.5.0'});
  const steps=[
    {id:'toolchain-security',args:['scripts/toolchain-security-gate.cjs'],required:true},
    {id:'toolchain-health',args:['scripts/toolchain-bootstrap.cjs','health'],required:true},
    {id:'telemetry',args:['scripts/integration-telemetry.cjs','health'],required:true},
    {id:'snapshot',args:['scripts/cas-merkle-store.cjs','snapshot','pre-control-plane'],required:true},
    {id:'native-ast-dataflow',args:['scripts/native-ast-dataflow.cjs'],required:true},
    {id:'semantic-graph',args:['scripts/semantic-dependency-graph.cjs'],required:true},
    {id:'change-impact',args:['scripts/change-impact-orchestrator.cjs'],required:true},
    {id:'assets',args:['scripts/asset-registry.cjs'],required:true},
    {id:'project-directives',args:['scripts/project-directive-gate.cjs'],required:true},
    {id:'asset-ingestion-plan',args:['scripts/asset-ingestion-planner.cjs'],required:true},
    {id:'technology-lock',args:['scripts/technology-lock-validator.cjs'],required:true},
    {id:'graphics-ratchet',args:['scripts/graphics-regression-guard.cjs'],required:true},
    {id:'audio-variation',args:['scripts/audio-variation-validator.cjs'],required:true},
    {id:'gameplay-spatial-contract',args:['scripts/gameplay-physical-contract-validator.cjs'],required:true},
    {id:'desktop-ai-report-contract',args:['scripts/desktop-ai-report-validator.cjs'],required:true},
    {id:'queue',args:['scripts/durable-job-queue.cjs','health'],required:true},
    {id:'config-contract',args:['scripts/config-contract-validator.cjs'],required:true},
    {id:'feature-flags',args:['scripts/feature-flag-engine.cjs','health'],required:true},
    {id:'wit-component-contract',args:['scripts/wit-component-validator.cjs'],required:true},
    {id:'adapter-sandbox',args:['scripts/adapter-sandbox.cjs','health'],required:true},
    {id:'secure-update',args:['scripts/secure-update-metadata.cjs','health'],required:true},
    {id:'reproducible-build',args:['scripts/reproducible-build-gate.cjs'],required:true},
    {id:'vercel-root-check',args:['scripts/check-vercel-root-directory.cjs'],required:true},
    {id:'model-check',args:['scripts/model-state-checker.cjs'],required:true},
    {id:'cas-peer-discovery',args:['scripts/cas-peer-discovery.cjs'],required:true},
    {id:'distributed-cas',args:['scripts/distributed-cas.cjs','health'],required:true},
    {id:'device-lab',args:['scripts/device-lab-orchestrator.cjs','health'],required:true},
    {id:'device-executor',args:['scripts/device-test-executor.cjs','health'],required:true},
    {id:'wit-bindings',args:['scripts/wit-bindings-generator.cjs'],required:true},
    {id:'rekor-monitor',args:['scripts/rekor-monitor.cjs'],required:true},
    {id:'technology-consensus',args:['scripts/technology-consensus.cjs'],required:true},
    {id:'sbom',args:['scripts/cyclonedx-sbom.cjs'],required:true},
    {id:'legacy-evidence-factory',args:['scripts/legacy-evidence-factory.cjs'],required:true},
    {id:'slo-error-budget',args:['scripts/slo-error-budget-controller.cjs','health'],required:true},
    {id:'db-migration-coordinator',args:['scripts/database-migration-coordinator.cjs','health'],required:true},
    {id:'asset-delta',args:['scripts/asset-delta-distributor.cjs','selftest'],required:true},
    {id:'integration-gate',args:['scripts/system-integration-gate.cjs'],required:true},
    {id:'disaster-recovery-verify',args:['scripts/cas-merkle-store.cjs','verify'],required:true},
    {id:'provenance',args:['scripts/provenance.cjs'],required:true},
    {id:'supply-chain-signing',args:['scripts/artifact-signing-transparency.cjs','health'],required:true},
    {id:'policy',args:['scripts/policy-engine.cjs'],required:true},
    {id:'chaos-safety',args:['scripts/integration-chaos-test.cjs'],required:true},
    {id:'orchestrator-monitor-lifecycle',args:['scripts/orchestrator-monitor-lifecycle.cjs','health'],required:true},
    {id:'orchestrator-patch-safety',args:['scripts/orchestrator-patch-safety-gate.cjs','health'],required:true},
    {id:'orchestrator-minimal-repro',args:['scripts/orchestrator-minimal-repro.cjs','health'],required:true},
    {id:'orchestrator-invariant-model',args:['scripts/orchestrator-invariant-model.cjs'],required:true},
    {id:'orchestrator-supervisor-negative',args:['scripts/orchestrator-supervisor.cjs','selftest'],required:true},
    {id:'orchestrator-supervisor',args:['scripts/orchestrator-supervisor.cjs','health'],required:true},
    {id:'capability-scheduler',args:['scripts/capability-aware-scheduler.cjs','health'],required:true},
    {id:'cas-redundancy',args:['scripts/cas-redundancy-verifier.cjs'],required:true},
    {id:'device-worker',args:['scripts/device-worker-server.cjs','health'],required:true},
    {id:'record-replay',args:['scripts/deterministic-record-replay.cjs','selftest'],required:true},
    {id:'dependency-security',args:['scripts/dependency-security-orchestrator.cjs','health'],required:true},
    {id:'transactional-deploy',args:['scripts/transactional-deploy.cjs','health'],required:true},
    {id:'enhancement-orchestrator',args:['scripts/system-enhancement-orchestrator.cjs'],required:true},
    {id:'leader-lease-health',args:['scripts/leader-lease-fencing.cjs','health'],required:true},
    {id:'leader-lease-selftest',args:['scripts/leader-lease-fencing.cjs','selftest'],required:true},
    {id:'production-safety-health',args:['scripts/production-safety-controller.cjs','health'],required:true},
    {id:'production-safety-selftest',args:['scripts/production-safety-controller.cjs','selftest'],required:true},
    {id:'soak-chaos',args:['scripts/soak-chaos-verifier.cjs'],required:true},
    {id:'crash-diagnostics',args:['scripts/crash-diagnostics-cluster.cjs','cluster'],required:true},
    {id:'crash-diagnostics-selftest',args:['scripts/crash-diagnostics-cluster.cjs','selftest'],required:true},
    {id:'causal-debugger',args:['scripts/causal-debugger.cjs','build'],required:true},
    {id:'cas-replication-controller',args:['scripts/cas-replication-controller.cjs'],required:true},
    {id:'physical-device-fleet',args:['scripts/physical-device-fleet.cjs'],required:true},
    {id:'production-slo-autopilot',args:['scripts/production-slo-autopilot.cjs'],required:true},
    {id:'migration-fencing-runtime',args:['scripts/migration-fencing-verifier.cjs'],required:true},
    {id:'long-soak-smoke',args:['scripts/long-soak-runner.cjs','selftest'],required:true},
    {id:'native-causal-collector',args:['scripts/native-causal-collector.cjs'],required:true},
    {id:'selftest',args:['scripts/integration-selftest.cjs'],required:true},
    {id:'honest-100-functions',args:['scripts/function-honest-100-auditor.cjs'],required:true},
    {id:'function-contract-coverage',args:['scripts/function-contract-coverage.cjs'],required:true},
    {id:'monotonic-100-guard',args:['scripts/function-monotonic-enhancement-gate.cjs','verify-or-bootstrap'],required:true},
    {id:'orchestrator-continuity',args:['scripts/orchestrator-continuity-gate.cjs'],required:true},
    {id:'release-promotion',args:['scripts/release-promotion-controller.cjs'],required:true},
    {id:'readiness',args:['scripts/system-readiness.cjs'],required:true}
  ];
  const results=[];
  for(const step of steps){
    const span=startSpan(`world-server.integration.${step.id}`,{required:step.required},root.traceparent),started=Date.now();
    try{
      const stdout=cp.execFileSync(process.execPath,step.args,{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,TRACEPARENT:span.traceparent}});
      results.push({id:step.id,required:step.required,pass:true,durationMs:Date.now()-started,stdout:String(stdout||'').trim().slice(-4000)});
      await span.end('OK',{durationMs:Date.now()-started}); console.log(`[CONTROL_PLANE] PASS ${step.id}`);
    }catch(e){
      const err=String(e.stderr||e.stdout||e.message||'').trim();
      results.push({id:step.id,required:step.required,pass:false,durationMs:Date.now()-started,error:err.slice(-4000),exitCode:Number.isInteger(e.status)?e.status:1});
      await span.end('ERROR',{error:err.slice(-500),durationMs:Date.now()-started}); console.error(`[CONTROL_PLANE] FAIL ${step.id}: ${err.split('\n').slice(-1)[0]}`);
    }
  }
  const requiredFailures=results.filter(x=>x.required&&!x.pass).map(x=>x.id),report={schemaVersion:'7.5.0',generatedAt:nowIso(),traceId:root.traceId,traceparent:root.traceparent,pass:requiredFailures.length===0,requiredFailures,steps:results};
  writeJSON(path.join(ROOT,'CONTROL_PLANE_REPORT.json'),report); await root.end(report.pass?'OK':'ERROR',{requiredFailures:requiredFailures.length});
  console.log(`[CONTROL_PLANE] ${report.pass?'PASS':'FAIL'} ${results.filter(x=>x.pass).length}/${results.length} trace=${root.traceId}`); if(!report.pass)process.exitCode=2;
})().catch(e=>{console.error('[CONTROL_PLANE] FATAL',e.stack||e.message);process.exit(2)});
