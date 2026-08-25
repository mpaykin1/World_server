#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');
const HERE=__dirname,PAYLOAD=path.join(HERE,'payload'),ROOT=path.resolve(process.argv[2]||process.cwd()),KNOWN=JSON.parse(fs.readFileSync(path.join(HERE,'KNOWN_VARIANTS.json'),'utf8')),PREVIOUS=JSON.parse(fs.readFileSync(path.join(HERE,'PREVIOUS_INTEGRATION_VARIANTS.json'),'utf8')),TARGET_VERSION='7.5.0',MANIFEST=JSON.parse(fs.readFileSync(path.join(HERE,'PATCH_MANIFEST.json'),'utf8'));
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),BACK=path.join(ROOT,'.system-integration-backups',`v7-5-${stamp}`);const sha=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
function branch(){try{return cp.execFileSync('git',['branch','--show-current'],{cwd:ROOT,encoding:'utf8'}).trim()}catch{return''}}
function semver(v){return String(v||'0').split('.').map(x=>Number(String(x).replace(/\D.*$/,''))||0)}function cmp(a,b){a=semver(a);b=semver(b);for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]-b[i]}return 0}
function backup(rel){const src=path.join(ROOT,rel);if(!fs.existsSync(src))return;const dst=path.join(BACK,rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}
function copy(rel){const src=path.join(PAYLOAD,rel),dst=path.join(ROOT,rel);if(!fs.existsSync(src))throw new Error(`payload missing ${rel}`);backup(rel);fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(src,dst)}
function verifyPayload(){for(const [rel,expected] of Object.entries(MANIFEST.files||{})){const f=path.join(HERE,rel);if(!fs.existsSync(f))throw new Error(`patch payload missing ${rel}`);if(sha(f)!==expected)throw new Error(`patch payload hash mismatch ${rel}`)}}
function listFiles(dir,base=dir,out=[]){for(const e of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,e.name);if(e.isDirectory())listFiles(p,base,out);else out.push(path.relative(base,p).replaceAll('\\','/'))}return out}
try{verifyPayload()}catch(e){console.error('[INTEGRATION_V7_5_INSTALL] REFUSE',e.message);process.exit(1)}
const br=branch();if(['master','main'].includes(br)){console.error('[INTEGRATION_V7_5_INSTALL] refuse protected branch; create ai/desktop/system-integration-v7-5');process.exit(2)}
const currentVersion=(()=>{try{return JSON.parse(fs.readFileSync(path.join(ROOT,'data/system-integration-version.json'),'utf8')).version}catch{return'0.0.0'}})();if(cmp(currentVersion,TARGET_VERSION)>0){console.error(`[INTEGRATION_V7_5_INSTALL] refuse downgrade current=${currentVersion} target=${TARGET_VERSION}`);process.exit(2)}
const touched=new Set();
try{
  // Critical shared paths: only overwrite variants that are explicitly known from the active patch family or this integration layer.
  for(const rel of Object.keys(KNOWN)){
    const dst=path.join(ROOT,rel);if(fs.existsSync(dst)){const h=sha(dst);if(!KNOWN[rel].includes(h))throw new Error(`unknown/newer shared variant at ${rel}; compute dependency impact and semantic-merge instead of overwrite`)}copy(rel);touched.add(rel)
  }
  // Integration-owned namespace. A version guard above prevents an older layer from overwriting a newer one.
  const owned=listFiles(PAYLOAD).filter(rel=>!Object.prototype.hasOwnProperty.call(KNOWN,rel));
  const runtimeSeed=rel=>/^[A-Z0-9_]+_(STATUS|REPORT)\.json$/.test(rel)||['ASSET_DELTA_STATUS.json','CAUSAL_DEBUGGER_STATUS.json','DB_MIGRATION_COORDINATOR_STATUS.json','SLO_ERROR_BUDGET_STATUS.json'].includes(rel);
  for(const rel of owned){
    const src=path.join(PAYLOAD,rel),dst=path.join(ROOT,rel),newHash=sha(src);
    if(runtimeSeed(rel)&&fs.existsSync(dst))continue; // runtime evidence is regenerated, never overwritten by installer
    if(fs.existsSync(dst)){
      const currentHash=sha(dst);
      if(cmp(currentVersion,TARGET_VERSION)===0&&currentHash!==newHash)throw new Error(`same-version local drift at ${rel}; refuse overwrite and require semantic merge/version bump`);
      if(cmp(currentVersion,TARGET_VERSION)<0&&currentHash!==newHash){
        const allowed=(PREVIOUS[currentVersion]||{})[rel]||[];
        if(!allowed.includes(currentHash))throw new Error(`unknown/local-modified integration path at ${rel}; refuse upgrade overwrite and require semantic merge`);
      }
    }
    copy(rel);touched.add(rel)
  }
  // Remove superseded V2-only files only when their hashes exactly match the known V2 payload. Never delete locally modified files.
  if(['2.0.0','3.0.0','4.0.0','5.0.0','6.0.0'].includes(currentVersion)){
    for(const rel of (currentVersion==='6.0.0'?['.github/workflows/system-integration-v6.yml','DESKTOP_AI_SYSTEM_INTEGRATION_V6.md','docs/buildtypes/system-integration-v6.md','config/integration-v6.cue']:currentVersion==='5.0.0'?['.github/workflows/system-integration-v5.yml','DESKTOP_AI_SYSTEM_INTEGRATION_V5.md','docs/buildtypes/system-integration-v5.md','config/integration-v5.cue']:currentVersion==='4.0.0'?['.github/workflows/system-integration-v4.yml','DESKTOP_AI_SYSTEM_INTEGRATION_V4.md','docs/buildtypes/system-integration-v4.md','config/integration-v4.cue']:currentVersion==='3.0.0'?['.github/workflows/system-integration-v3.yml','DESKTOP_AI_SYSTEM_INTEGRATION_V3.md','docs/buildtypes/system-integration-v3.md']:['.github/workflows/system-integration-v2.yml','DESKTOP_AI_SYSTEM_INTEGRATION_V2.md','docs/buildtypes/system-integration-v2.md'])){
      const dst=path.join(ROOT,rel);if(!fs.existsSync(dst))continue;const h=sha(dst),allowed=(PREVIOUS[currentVersion]||{})[rel]||[];if(!allowed.includes(h))throw new Error(`superseded V2 file was locally modified at ${rel}; refuse delete and require semantic merge`);backup(rel);fs.unlinkSync(dst);touched.add(rel)
    }
  }
  const pp=path.join(ROOT,'package.json');if(!fs.existsSync(pp))throw new Error('package.json missing');backup('package.json');touched.add('package.json');const pkg=JSON.parse(fs.readFileSync(pp,'utf8'));pkg.scripts=pkg.scripts||{};Object.assign(pkg.scripts,{
    'integration:gate':'node scripts/system-integration-gate.cjs',
    'integration:assets':'node scripts/asset-registry.cjs',
    'integration:queue:health':'node scripts/durable-job-queue.cjs health',
    'integration:queue:recover':'node scripts/durable-job-queue.cjs resume-stale',
    'integration:tech':'node scripts/technology-consensus.cjs',
    'integration:telemetry':'node scripts/integration-telemetry.cjs health',
    'integration:graph':'node scripts/cas-merkle-store.cjs index',
    'integration:impact':'node scripts/cas-merkle-store.cjs impact',
    'integration:impact:auto':'node scripts/change-impact-orchestrator.cjs',
    'integration:snapshot':'node scripts/cas-merkle-store.cjs snapshot',
    'integration:dr:verify':'node scripts/cas-merkle-store.cjs verify',
    'integration:policy':'node scripts/policy-engine.cjs',
    'integration:provenance':'node scripts/provenance.cjs',
    'integration:directives':'node scripts/project-directive-gate.cjs',
    'integration:assets:plan':'node scripts/asset-ingestion-planner.cjs',
    'integration:tech-lock':'node scripts/technology-lock-validator.cjs',
    'integration:graphics':'node scripts/graphics-regression-guard.cjs',
    'integration:audio':'node scripts/audio-variation-validator.cjs',
    'integration:gameplay':'node scripts/gameplay-physical-contract-validator.cjs',
    'integration:report':'node scripts/desktop-ai-report-validator.cjs',
    'integration:sbom':'node scripts/cyclonedx-sbom.cjs',
    'integration:update-trust':'node scripts/secure-update-metadata.cjs health',
    'integration:flags':'node scripts/feature-flag-engine.cjs health',
    'integration:config':'node scripts/config-contract-validator.cjs',
    'integration:sandbox':'node scripts/adapter-sandbox.cjs health',
    'integration:repro':'node scripts/reproducible-build-gate.cjs',
    'integration:promotion':'node scripts/release-promotion-controller.cjs',
    'integration:chaos':'node scripts/integration-chaos-test.cjs',
    'integration:supply-chain':'node scripts/artifact-signing-transparency.cjs health',
    'integration:model-check':'node scripts/model-state-checker.cjs',
    'integration:cas:distributed':'node scripts/distributed-cas.cjs health',
    'integration:semantic':'node scripts/semantic-dependency-graph.cjs',
    'integration:devices':'node scripts/device-lab-orchestrator.cjs health',
    'integration:wit':'node scripts/wit-component-validator.cjs',
    'integration:toolchain':'node scripts/toolchain-bootstrap.cjs health',
    'integration:toolchain:apply':'node scripts/toolchain-bootstrap.cjs apply',
    'integration:toolchain:security':'node scripts/toolchain-security-gate.cjs',
    'integration:ast':'node scripts/native-ast-dataflow.cjs',
    'integration:tlc':'node scripts/tlc-native-runner.cjs',
    'integration:rekor':'node scripts/rekor-monitor.cjs',
    'integration:cas:discover':'node scripts/cas-peer-discovery.cjs',
    'integration:devices:execute':'node scripts/device-test-executor.cjs run',
    'integration:wit:bindings':'node scripts/wit-bindings-generator.cjs',
    'integration:supervisor':'node scripts/orchestrator-supervisor.cjs health',
    'integration:supervisor:selftest':'node scripts/orchestrator-supervisor.cjs selftest',
    'integration:orchestrator:monitor':'node scripts/orchestrator-monitor-lifecycle.cjs health',
    'integration:orchestrator:patch':'node scripts/orchestrator-patch-safety-gate.cjs health',
    'integration:orchestrator:repro':'node scripts/orchestrator-minimal-repro.cjs health',
    'integration:orchestrator:model':'node scripts/orchestrator-invariant-model.cjs',
    'integration:orchestrator:continuity':'node scripts/orchestrator-continuity-gate.cjs',
    'integration:scheduler':'node scripts/capability-aware-scheduler.cjs health',
    'integration:cas:redundancy':'node scripts/cas-redundancy-verifier.cjs',
    'integration:device-worker':'node scripts/device-worker-server.cjs health',
    'integration:record-replay':'node scripts/deterministic-record-replay.cjs selftest',
    'integration:security:health':'node scripts/dependency-security-orchestrator.cjs health',
    'integration:security:scan':'node scripts/dependency-security-orchestrator.cjs scan',
    'integration:deploy:health':'node scripts/transactional-deploy.cjs health',
    'integration:deploy':'node scripts/transactional-deploy.cjs deploy',
    'integration:leader-lease':'node scripts/leader-lease-fencing.cjs health',
    'integration:leader-lease:selftest':'node scripts/leader-lease-fencing.cjs selftest',
    'integration:leader-lease:acquire':'node scripts/leader-lease-fencing.cjs acquire',
    'integration:leader-lease:renew':'node scripts/leader-lease-fencing.cjs renew',
    'integration:production-safety':'node scripts/production-safety-controller.cjs health',
    'integration:production-safety:selftest':'node scripts/production-safety-controller.cjs selftest',
    'integration:production:rollback':'node scripts/production-safety-controller.cjs rollback',
    'integration:soak-chaos':'node scripts/soak-chaos-verifier.cjs',
    'integration:crash-diagnostics':'node scripts/crash-diagnostics-cluster.cjs cluster',
    'integration:crash-diagnostics:capture':'node scripts/crash-diagnostics-cluster.cjs capture',
    'integration:crash-diagnostics:selftest':'node scripts/crash-diagnostics-cluster.cjs selftest',
    'integration:legacy-evidence':'node scripts/legacy-evidence-factory.cjs',
    'integration:legacy-evidence:selftest':'node scripts/legacy-evidence-factory.cjs selftest',
    'integration:slo':'node scripts/slo-error-budget-controller.cjs health',
    'integration:slo:evaluate':'node scripts/slo-error-budget-controller.cjs evaluate',
    'integration:db:migration':'node scripts/database-migration-coordinator.cjs health',
    'integration:db:migration:apply':'node scripts/database-migration-coordinator.cjs apply',
    'integration:asset-delta':'node scripts/asset-delta-distributor.cjs selftest',
    'integration:asset-delta:build':'node scripts/asset-delta-distributor.cjs build',
    'integration:causal-debug':'node scripts/causal-debugger.cjs build',
    'integration:causal-debug:health':'node scripts/causal-debugger.cjs health',
    'integration:cas:replicate':'node scripts/cas-replication-controller.cjs',
    'integration:device-fleet':'node scripts/physical-device-fleet.cjs',
    'integration:slo:autopilot':'node scripts/production-slo-autopilot.cjs',
    'integration:db:fencing':'node scripts/migration-fencing-verifier.cjs',
    'integration:soak:long':'node scripts/long-soak-runner.cjs run 8 --resume',
    'integration:soak:24h':'node scripts/long-soak-runner.cjs run 24 --resume',
    'integration:causal:native':'node scripts/native-causal-collector.cjs',
    'integration:functions:audit':'node scripts/function-honest-100-auditor.cjs',
    'integration:functions:coverage':'node scripts/function-contract-coverage.cjs',
    'integration:functions:baseline':'node scripts/function-monotonic-enhancement-gate.cjs baseline',
    'integration:functions:verify':'node scripts/function-monotonic-enhancement-gate.cjs verify',
    'integration:functions:health':'node scripts/function-monotonic-enhancement-gate.cjs health',
    'integration:enhance':'node scripts/system-enhancement-orchestrator.cjs',
    'integration:readiness':'node scripts/system-readiness.cjs',
    'integration:selftest':'node scripts/integration-selftest.cjs',
    'integration:verify':'node scripts/system-control-plane.cjs --verify',
    'integration:full':'node scripts/system-control-plane.cjs'
  });
  if(pkg.scripts['release:gate']&&!String(pkg.scripts['release:gate']).includes('integration:verify'))pkg.scripts['release:gate']+=' && npm run integration:verify';
  fs.writeFileSync(pp,JSON.stringify(pkg,null,2)+'\n');
  // Update the persistent Desktop AI protocol without deleting older instructions.
  const desk='DESKTOP_AI_INSTALL_AND_VERIFY.md',deskPath=path.join(ROOT,desk),section=fs.readFileSync(path.join(HERE,'DESKTOP_AI_INSTRUCTIONS.md'),'utf8');backup(desk);touched.add(desk);let existing=fs.existsSync(deskPath)?fs.readFileSync(deskPath,'utf8'):'';if(!existing.includes('# Desktop AI — System Integration V7.5'))existing+=(existing.endsWith('\n')?'':'\n')+'\n---\n\n'+section;fs.writeFileSync(deskPath,existing);
  // Syntax validation for every integration-owned Node script.
  const nodeFiles=listFiles(path.join(PAYLOAD,'scripts')).filter(x=>x.endsWith('.cjs')||x.endsWith('.js'));for(const rel of nodeFiles)cp.execFileSync(process.execPath,['--check',path.join(ROOT,'scripts',rel.replace(/^scripts\//,''))],{stdio:'inherit'});
  cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/system-integration-gate.cjs')],{cwd:ROOT,stdio:'inherit'});
  if(process.env.SYSTEM_INTEGRATION_SKIP_FULL_VERIFY!=='1')cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/system-control-plane.cjs'),'--verify'],{cwd:ROOT,stdio:'inherit',env:{...process.env,SYSTEM_INTEGRATION_INSTALL:'1'}});
  fs.mkdirSync(BACK,{recursive:true});fs.writeFileSync(path.join(BACK,'INSTALL_TRANSACTION.json'),JSON.stringify({version:TARGET_VERSION,installedAt:new Date().toISOString(),branch:br,touched:[...touched].sort(),status:'PASS'},null,2)+'\n');
  console.log(`[INTEGRATION_V7_5_INSTALL] PASS version=${TARGET_VERSION} backup=${BACK}`);
}catch(e){console.error('[INTEGRATION_V7_5_INSTALL] FAIL',e.stack||e.message);for(const rel of [...touched].reverse()){const b=path.join(BACK,rel),dst=path.join(ROOT,rel);try{if(fs.existsSync(b)){fs.mkdirSync(path.dirname(dst),{recursive:true});fs.copyFileSync(b,dst)}else if(fs.existsSync(dst))fs.unlinkSync(dst)}catch{}}process.exit(1)}
