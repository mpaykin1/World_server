#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {ROOT,readJSON,writeJSON,nowIso}=require('./integration-utils.cjs');
const has=(p,s)=>{try{return fs.readFileSync(path.join(ROOT,p),'utf8').includes(s)}catch{return false}},exists=p=>fs.existsSync(path.join(ROOT,p));
const checks=[
 ['analyzer-v6-tech',has('scripts/world-quality-analyzer.js','graphics-tech-scout')||has('scripts/world-quality-analyzer.js','graphics-tech-detail-adapters')],
 ['analyzer-truth-cert',has('scripts/world-quality-analyzer.js','evaluateProductionCertification')&&has('scripts/world-quality-analyzer.js','production100Certified')],
 ['autopilot-tech-scout',has('scripts/world-quality-autopilot.js','world-graphics-technology-scout.js')],
 ['autopilot-truth-status',has('scripts/world-quality-autopilot.js','production100Certified')],
 ['fresh-device-evidence',has('scripts/world-device-profile-matrix.js','REAL_DEVICE_RUNTIME_EVIDENCE.json')&&has('scripts/world-device-profile-matrix.js','age<=24')],
 ['fresh-runtime-evidence',has('scripts/world-runtime-quality-profiler.js','REAL_DEVICE_RUNTIME_EVIDENCE.json')&&has('scripts/world-runtime-quality-profiler.js','age<=24')],
 ['canonical-mesh',has('services/ai3d-worker/ai3d/plugins/mesh_quality_optimizer.py','MeshOptimizationPipeline')],
 ['pwa-telemetry',has('api/quality-summary.js','pwaSamples')&&has('api/quality-telemetry.js','standalone_pwa')],
 ['real-ios-canary',has('.github/workflows/quality-canary.yml','real-ios-telemetry-gate.js')],
 ['truth-ci-workflow',has('.github/workflows/world-quality-autopilot.yml','WQA_REQUIRED_CI_PASS')],
 ['capability-registry',exists('data/system-capability-registry.json')],
 ['conflict-policy-semantic-merge',readJSON(path.join(ROOT,'data/system-conflict-policy.json'),{}).policy==='semantic-merge-never-last-writer-wins'],
 ['technology-catalog',exists('data/technology-candidate-catalog.json')],
 ['honest-100-function-certification',exists('data/function-honest-100-policy.json')&&exists('data/function-contracts.json')&&has('scripts/function-honest-100-auditor.cjs','CERTIFIED_100')],
 ['monotonic-function-enhancement',has('scripts/function-monotonic-enhancement-gate.cjs','certified-function-regressed')&&has('scripts/function-monotonic-enhancement-gate.cjs','capability-removed')],
 ['cas-merkle',has('scripts/cas-merkle-store.cjs','merkleRoot')&&has('scripts/cas-merkle-store.cjs','snapshot')&&has('scripts/cas-merkle-store.cjs','restore')],
 ['dependency-impact',has('scripts/cas-merkle-store.cjs','reverseDependencies')&&has('scripts/cas-merkle-store.cjs','DEPENDENCY_IMPACT_REPORT.json')],
 ['change-impact-orchestrator',has('scripts/change-impact-orchestrator.cjs','CHANGE_IMPACT_MATRIX.json')&&has('scripts/change-impact-orchestrator.cjs','recommendedTests')],
 ['durable-queue-wal',has('scripts/durable-job-queue.cjs','journal_mode=WAL')&&has('scripts/durable-job-queue.cjs','dead-letter')&&has('scripts/durable-job-queue.cjs','checkpoint')],
 ['telemetry-w3c-otlp',has('scripts/integration-telemetry-lib.cjs','TRACEPARENT')&&has('scripts/integration-telemetry-lib.cjs','/v1/traces')],
 ['opa-rego-bundle',exists('policy/opa-bundle/.manifest')&&has('policy/opa-bundle/worldserver.rego','package worldserver.integration')],
 ['policy-offline-enforcement',has('scripts/policy-engine.cjs','jsDecision')&&has('scripts/policy-engine.cjs','opaDecision')],
 ['slsa-v1-provenance',has('scripts/provenance.cjs','https://slsa.dev/provenance/v1')&&has('scripts/provenance.cjs','https://in-toto.io/Statement/v1')],
 ['asset-registry-content-addressed',has('scripts/asset-registry.cjs','cas+sha256')&&has('scripts/asset-registry.cjs','metadataCoverage')],
 ['project-constitution',String(readJSON(path.join(ROOT,'data/project-directives.json'),{}).schemaVersion||'').startsWith('7.')&&exists('scripts/project-directive-gate.cjs')],
 ['technology-lock',exists('scripts/technology-lock-validator.cjs')&&has('scripts/technology-lock-validator.cjs','actualApng')],
 ['asset-batch-planner',exists('scripts/asset-ingestion-planner.cjs')&&has('scripts/asset-ingestion-planner.cjs','APNG_PRESERVING_ATLAS_OR_SINGLE_ARCHIVE')],
 ['graphics-quality-ratchet',exists('scripts/graphics-regression-guard.cjs')&&readJSON(path.join(ROOT,'data/asset-quality-ratchet-policy.json'),{}).rules?.qualityDeltaMustBeNonNegative===true],
 ['audio-variation-gate',exists('scripts/audio-variation-validator.cjs')&&Number(readJSON(path.join(ROOT,'data/project-directives.json'),{}).audio?.minimumVariantsPerEvent)>=4],
 ['gameplay-spatial-contract',exists('scripts/gameplay-physical-contract-validator.cjs')&&exists('scripts/character-spatial-contract-lib.cjs')&&readJSON(path.join(ROOT,'data/gameplay-physical-contract.json'),{}).attack?.directionSource==='feet-forward'],
 ['desktop-ai-output-contract',exists('scripts/desktop-ai-report-validator.cjs')&&exists('data/desktop-ai-final-report.template.json')],
 ['cyclonedx-1.7-sbom',exists('scripts/cyclonedx-sbom.cjs')&&has('scripts/cyclonedx-sbom.cjs',"specVersion:'1.7'")],
 ['enhancement-orchestrator',exists('scripts/system-enhancement-orchestrator.cjs')],
 ['tuf-aligned-update-trust',exists('scripts/secure-update-metadata.cjs')&&readJSON(path.join(ROOT,'data/update-trust-policy.json'),{}).rollbackProtection===true],
 ['openfeature-aligned-flags',exists('scripts/feature-flag-engine.cjs')&&readJSON(path.join(ROOT,'data/flags.json'),{}).flags?.['release.progressiveRollout']!=null],
 ['cue-contract',exists('config/integration-v7.cue')&&exists('scripts/config-contract-validator.cjs')],
 ['wasi-wasmtime-sandbox',exists('scripts/adapter-sandbox.cjs')&&readJSON(path.join(ROOT,'data/adapter-sandbox-policy.json'),{}).mode==='fail-closed'],
 ['reproducible-build-gate',exists('scripts/reproducible-build-gate.cjs')],
 ['release-promotion-controller',exists('scripts/release-promotion-controller.cjs')],
 ['chaos-safety-tests',exists('scripts/integration-chaos-test.cjs')],
 ['sigstore-transparency',exists('scripts/artifact-signing-transparency.cjs')&&readJSON(path.join(ROOT,'data/supply-chain-signing-policy.json'),{}).localTransparencyLog===true],
 ['model-checking',exists('scripts/model-state-checker.cjs')&&exists('specs/DurableJobQueue.tla')&&exists('specs/ControlPlane.tla')],
 ['distributed-cas',exists('scripts/distributed-cas.cjs')&&readJSON(path.join(ROOT,'data/distributed-cas-policy.json'),{}).verifyEveryTransfer===true],
 ['semantic-symbol-dataflow',exists('scripts/semantic-dependency-graph.cjs')&&readJSON(path.join(ROOT,'data/semantic-graph-policy.json'),{}).mode==='module-symbol-lexical-dataflow'],
 ['real-device-lab',exists('scripts/device-lab-orchestrator.cjs')&&readJSON(path.join(ROOT,'data/device-lab-policy.json'),{}).realHardwareRequiredForRealDeviceClaim===true],
 ['wit-component-model',exists('scripts/wit-component-validator.cjs')&&exists('wit/world-server-adapter.wit')&&readJSON(path.join(ROOT,'data/component-model-policy.json'),{}).failClosed===true],
 ['ci-cosign-keyless',has('.github/workflows/system-integration-v7.yml','sigstore/cosign-installer@6f9f17788090df1f26f669e9d70d6ae9567deba6')&&has('.github/workflows/system-integration-v7.yml','id-token: write')],
 ['toolchain-bootstrap',exists('scripts/toolchain-bootstrap.cjs')&&readJSON(path.join(ROOT,'data/toolchain-bootstrap-policy.json'),{}).tools?.cosign?.minimumSafeVersion==='3.1.3'],
 ['toolchain-security',exists('scripts/toolchain-security-gate.cjs')],
 ['native-ast-dataflow',exists('scripts/native-ast-dataflow.cjs')&&readJSON(path.join(ROOT,'data/native-analysis-policy.json'),{}).engine==='typescript-compiler-api'],
 ['native-tlc-runner',exists('scripts/tlc-native-runner.cjs')&&has('.github/workflows/system-integration-v7.yml','tlc-native-runner.cjs --required')],
 ['cosign-security-floor-ci',has('.github/workflows/system-integration-v7.yml','cosign-release: v3.1.3')],
 ['rekor-monitor',exists('scripts/rekor-monitor.cjs')],
 ['cas-zero-config-discovery',exists('scripts/cas-peer-discovery.cjs')&&readJSON(path.join(ROOT,'data/cas-discovery-policy.json'),{}).autoReplicate===true],
 ['device-executor',exists('scripts/device-test-executor.cjs')],
 ['wit-bindings',exists('scripts/wit-bindings-generator.cjs')],
 ['control-plane-aggregates-errors',has('scripts/system-control-plane.cjs','CONTROL_PLANE_REPORT.json')&&has('scripts/system-control-plane.cjs','requiredFailures')],
 ['readiness-evidence',exists('scripts/system-readiness.cjs')],
 ['integration-selftest',exists('scripts/integration-selftest.cjs')],
 ['desktop-ai-v7',exists('DESKTOP_AI_SYSTEM_INTEGRATION_V7.md')||has('DESKTOP_AI_INSTALL_AND_VERIFY.md','System Integration V7')],
 ['orchestrator-bounded-watchdog',has('scripts/orchestrator-supervisor.cjs','restart-budget-exhausted')&&has('scripts/orchestrator-supervisor.cjs','circuitReport')],
 ['orchestrator-crash-fingerprint',has('scripts/orchestrator-supervisor.cjs','fingerprint')&&readJSON(path.join(ROOT,'data/orchestrator-supervisor-policy.json'),{}).sameFingerprintQuarantineThreshold===3],
 ['orchestrator-generation-lifecycle',exists('scripts/orchestrator-monitor-lifecycle.cjs')&&readJSON(path.join(ROOT,'data/orchestrator-monitor-policy.json'),{}).rejectStaleGeneration===true],
 ['orchestrator-minimal-repro',exists('scripts/orchestrator-minimal-repro.cjs')&&has('scripts/orchestrator-minimal-repro.cjs','AI_MIN_REPRO_')],
 ['orchestrator-patch-stable-safety',exists('scripts/orchestrator-patch-safety-gate.cjs')&&readJSON(path.join(ROOT,'data/orchestrator-patch-safety-policy.json'),{}).failureBehavior==='reject-and-preserve-stable'],
 ['orchestrator-invariant-model',exists('scripts/orchestrator-invariant-model.cjs')&&has('scripts/orchestrator-invariant-model.cjs','stable-mutated')],
 ['orchestrator-continuity-gate',exists('scripts/orchestrator-continuity-gate.cjs')&&has('scripts/orchestrator-continuity-gate.cjs','BLOCK_PROMOTION')],
 ['ci-integration-v7',exists('.github/workflows/system-integration-v7.yml')],
 ['legacy-evidence-factory-v74',exists('scripts/legacy-evidence-factory.cjs')&&readJSON(path.join(ROOT,'data/legacy-evidence-factory-policy.json'),{}).autoCertifyByName===false],
 ['slo-error-budget-v74',exists('scripts/slo-error-budget-controller.cjs')&&readJSON(path.join(ROOT,'data/slo-error-budget-policy.json'),{}).fastBurnThreshold===14.4],
 ['db-migration-coordinator-v74',exists('scripts/database-migration-coordinator.cjs')&&readJSON(path.join(ROOT,'data/migration-coordinator-policy.json'),{}).strategy==='expand-migrate-contract'],
 ['asset-delta-v74',exists('scripts/asset-delta-distributor.cjs')&&readJSON(path.join(ROOT,'data/asset-delta-policy.json'),{}).verifyEveryChunk===true],
 ['causal-debugger-v74',exists('scripts/causal-debugger.cjs')&&readJSON(path.join(ROOT,'data/causal-debugger-policy.json'),{}).secretRedaction===true],
 ['cas-replication-v75',exists('scripts/cas-replication-controller.cjs')&&readJSON(path.join(ROOT,'data/cas-replication-policy.json'),{}).readRepair===true],
 ['physical-device-fleet-v75',exists('scripts/physical-device-fleet.cjs')&&readJSON(path.join(ROOT,'data/device-fleet-policy.json'),{}).requireRealHardware===true&&has('scripts/device-worker-server.cjs','/evidence')&&has('scripts/device-worker-server.cjs','createHmac')],
 ['production-slo-autopilot-v75',exists('scripts/production-slo-autopilot.cjs')&&readJSON(path.join(ROOT,'data/production-slo-autopilot-policy.json'),{}).requireProductionEvidenceForAutomaticRollback===true],
 ['migration-fencing-runtime-v75',exists('scripts/migration-fencing-verifier.cjs')&&readJSON(path.join(ROOT,'data/migration-fencing-policy.json'),{}).requireExactFencingToken===true],
 ['long-soak-v75',exists('scripts/long-soak-runner.cjs')&&Number(readJSON(path.join(ROOT,'data/long-soak-policy.json'),{}).minimumCertifiedHours)>=8],
 ['native-causal-collector-v75',exists('scripts/native-causal-collector.cjs')&&readJSON(path.join(ROOT,'data/native-causal-collector-policy.json'),{}).requireTraceCorrelation===true],
 ['legacy-recipes-v75',(readJSON(path.join(ROOT,'data/legacy-evidence-recipes.json'),{}).recipes||[]).length===18]
];
let pkg={scripts:{}};try{pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'))}catch{}
checks.push(['integration-verify-script',Boolean(pkg.scripts?.['integration:verify'])]);
checks.push(['release-gate-wired',String(pkg.scripts?.['release:gate']||'').includes('integration:verify')]);
checks.push(['directive-script-wired',Boolean(pkg.scripts?.['integration:directives'])]);
checks.push(['graphics-guard-wired',Boolean(pkg.scripts?.['integration:graphics'])]);
checks.push(['gameplay-contract-wired',Boolean(pkg.scripts?.['integration:gameplay'])]);
checks.push(['desktop-ai-report-wired',Boolean(pkg.scripts?.['integration:report'])]);
checks.push(['update-trust-wired',Boolean(pkg.scripts?.['integration:update-trust'])]);
checks.push(['feature-flags-wired',Boolean(pkg.scripts?.['integration:flags'])]);
checks.push(['config-contract-wired',Boolean(pkg.scripts?.['integration:config'])]);
checks.push(['sandbox-wired',Boolean(pkg.scripts?.['integration:sandbox'])]);
checks.push(['repro-build-wired',Boolean(pkg.scripts?.['integration:repro'])]);
checks.push(['supply-chain-wired',Boolean(pkg.scripts?.['integration:supply-chain'])]);
checks.push(['model-check-wired',Boolean(pkg.scripts?.['integration:model-check'])]);
checks.push(['distributed-cas-wired',Boolean(pkg.scripts?.['integration:cas:distributed'])]);
checks.push(['semantic-graph-wired',Boolean(pkg.scripts?.['integration:semantic'])]);
checks.push(['device-lab-wired',Boolean(pkg.scripts?.['integration:devices'])]);
checks.push(['wit-component-wired',Boolean(pkg.scripts?.['integration:wit'])]);
checks.push(['toolchain-wired',Boolean(pkg.scripts?.['integration:toolchain'])&&Boolean(pkg.scripts?.['integration:toolchain:apply'])]);
checks.push(['toolchain-security-wired',Boolean(pkg.scripts?.['integration:toolchain:security'])]);
checks.push(['native-ast-wired',Boolean(pkg.scripts?.['integration:ast'])]);
checks.push(['native-tlc-wired',Boolean(pkg.scripts?.['integration:tlc'])]);
checks.push(['rekor-monitor-wired',Boolean(pkg.scripts?.['integration:rekor'])]);
checks.push(['cas-discovery-wired',Boolean(pkg.scripts?.['integration:cas:discover'])]);
checks.push(['device-executor-wired',Boolean(pkg.scripts?.['integration:devices:execute'])]);
checks.push(['wit-bindings-wired',Boolean(pkg.scripts?.['integration:wit:bindings'])]);
checks.push(['chaos-wired',Boolean(pkg.scripts?.['integration:chaos'])]);
checks.push(['orchestrator-monitor-wired',Boolean(pkg.scripts?.['integration:orchestrator:monitor'])]);
checks.push(['orchestrator-patch-wired',Boolean(pkg.scripts?.['integration:orchestrator:patch'])]);
checks.push(['orchestrator-repro-wired',Boolean(pkg.scripts?.['integration:orchestrator:repro'])]);
checks.push(['orchestrator-model-wired',Boolean(pkg.scripts?.['integration:orchestrator:model'])]);
checks.push(['orchestrator-continuity-wired',Boolean(pkg.scripts?.['integration:orchestrator:continuity'])]);
checks.push(['leader-lease-wired',Boolean(pkg.scripts?.['integration:leader-lease'])]);
checks.push(['production-safety-wired',Boolean(pkg.scripts?.['integration:production-safety'])]);
checks.push(['soak-chaos-wired',Boolean(pkg.scripts?.['integration:soak-chaos'])]);
checks.push(['crash-diagnostics-wired',Boolean(pkg.scripts?.['integration:crash-diagnostics'])]);
checks.push(['leader-lease-migration',fs.existsSync(path.join(ROOT,'supabase/migrations/20260824_orchestrator_leader_lease.sql'))]);
checks.push(['legacy-evidence-wired',Boolean(pkg.scripts?.['integration:legacy-evidence'])]);
checks.push(['slo-error-budget-wired',Boolean(pkg.scripts?.['integration:slo'])]);
checks.push(['db-migration-wired',Boolean(pkg.scripts?.['integration:db:migration'])]);
checks.push(['asset-delta-wired',Boolean(pkg.scripts?.['integration:asset-delta'])]);
checks.push(['causal-debugger-wired',Boolean(pkg.scripts?.['integration:causal-debug'])]);
checks.push(['cas-replication-wired',Boolean(pkg.scripts?.['integration:cas:replicate'])]);
checks.push(['device-fleet-wired',Boolean(pkg.scripts?.['integration:device-fleet'])]);
checks.push(['production-slo-autopilot-wired',Boolean(pkg.scripts?.['integration:slo:autopilot'])]);
checks.push(['migration-fencing-wired',Boolean(pkg.scripts?.['integration:db:fencing'])]);
checks.push(['long-soak-wired',Boolean(pkg.scripts?.['integration:soak:long'])]);
checks.push(['native-causal-collector-wired',Boolean(pkg.scripts?.['integration:causal:native'])]);
const passCount=checks.filter(x=>x[1]).length,percent=Math.round(passCount/checks.length*100),failed=checks.filter(x=>!x[1]).map(x=>x[0]);
const report={schemaVersion:'7.5.0',system:'SYSTEM_INTEGRATION_GATE',generatedAt:nowIso(),percent,pass:failed.length===0,passed:passCount,total:checks.length,failed,checks:Object.fromEntries(checks)};
writeJSON(path.join(ROOT,'SYSTEM_INTEGRATION_REPORT.json'),report);console.log(`[SYSTEM_INTEGRATION_V7] ${percent}% ${report.pass?'PASS':'FAIL'} ${passCount}/${checks.length}${failed.length?' '+failed.join(','):''}`);if(failed.length)process.exitCode=2;
