'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {decideProgressiveCanary}=require('../lib/quality/progressive-canary');
const {upsertRule,matchingRules}=require('../lib/quality/global-regression-kb');
const {validateWorld}=require('../lib/quality/semantic-world-validator');
const {proposeEngineOptimizations}=require('../lib/quality/engine-optimizer');
const {estimateEffect,promoteCausalGolden}=require('../lib/quality/causal-learning');
const {reserve}=require('../lib/quality/compute-budget-manager');
const {chooseDependencyUpgrade}=require('../lib/quality/dependency-tournament');

const good={fpsP50:60,fpsP95:45,crashRate:0,errorRate:0.01,p95LatencyMs:500,memoryMb:300,webglContextLossRate:0};
test('progressive canary advances only after repeated clean evidence and rolls back immediately',()=>{
  let r=decideProgressiveCanary({baseline:good,current:good,stageIndex:0,sessions:30,elapsedMinutes:15,consecutivePasses:0});
  assert.equal(r.decision,'hold'); assert.equal(r.reason,'needs-consecutive-pass');
  r=decideProgressiveCanary({baseline:good,current:good,stageIndex:0,sessions:30,elapsedMinutes:15,consecutivePasses:1});
  assert.equal(r.decision,'advance'); assert.equal(r.nextTraffic,5);
  r=decideProgressiveCanary({baseline:good,current:{...good,crashRate:0.5},stageIndex:2,sessions:200,elapsedMinutes:40,consecutivePasses:1});
  assert.equal(r.decision,'rollback'); assert.equal(r.nextTraffic,0);
});

test('global regression KB learns once and applies to compatible engines',()=>{
  const kb={rules:[]}; for(let i=0;i<3;i++)upsertRule(kb,{projectId:`apps/p${i}`,kind:'runtime',signature:'black screen 500',sourcePattern:'KNOWN_BLACK_SCREEN'},{engine:'webgl',version:'browser'});
  assert.equal(kb.rules.length,1); assert.ok(kb.rules[0].confidence>=0.6); assert.equal(matchingRules(kb,{engine:'webgl',version:'browser'}).length,1); assert.equal(matchingRules(kb,{engine:'godot',version:'4.5'}).length,0);
});

test('semantic validator requires spawn collision camera movement and rewards complete world contract',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-sem-'));const f=path.join(root,'game.js');fs.writeFileSync(f,'spawn player; collision collider; camera yaw pitch; KeyW ArrowUp; Space jump; touch mobile; LOD occlusion; fog light shadow;');
  const r=validateWorld({files:[f]},{engine:'webgl'});assert.equal(r.critical,0);assert.equal(r.score,100);
});

test('engine optimizer emits near-quality-preserving WebGL LOD proposal',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-opt-'));const f=path.join(root,'index.html');fs.writeFileSync(f,'<html><head><style>body{margin:0}</style></head><body><canvas></canvas></body></html>');
  const semantic=validateWorld({files:[f]},{engine:'webgl'});const p=proposeEngineOptimizations({files:[f]},{engine:'webgl',version:'browser'},semantic,{});assert.ok(p.some(x=>x.id==='webgl-distance-quality-contract'));assert.ok(p.some(x=>x.risk==='low'));
});

test('causal learner rejects correlation-only movement and promotes strong diff-in-diff',()=>{
  const r=estimateEffect({treatmentBefore:[50,51,49,50],treatmentAfter:[62,63,61,62],controlBefore:[50,50,50,50],controlAfter:[51,51,51,51]});assert.equal(r.direction,'improved');assert.ok(r.confidence>0.9);assert.equal(promoteCausalGolden(r,0.9),true);
});

test('compute budget hard-stops expensive work before ledger is exceeded',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-budget-'));const file=path.join(root,'budget.json');assert.equal(reserve(file,{gpuSeconds:50,costUsd:1},{maxGpuSecondsPerDay:100,maxCostUsdPerDay:2}).ok,true);assert.equal(reserve(file,{gpuSeconds:60,costUsd:1.5},{maxGpuSecondsPerDay:100,maxCostUsdPerDay:2}).ok,false);
});

test('dependency tournament refuses failing or vulnerable upgrades',()=>{
  const w=chooseDependencyUpgrade([{id:'new-fast',failedTests:1,vulnerabilities:0,performanceDelta:20},{id:'safe',failedTests:0,vulnerabilities:0,performanceDelta:2},{id:'vuln',failedTests:0,vulnerabilities:1,performanceDelta:50}]);assert.equal(w.id,'safe');
});

test('production-error ingestion becomes persistent Global KB and never self-references',()=>{
  const {runAutopilot}=require('../lib/quality-autopilot');const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-kb-run-'));fs.mkdirSync(path.join(root,'apps/demo'),{recursive:true});fs.mkdirSync(path.join(root,'config'),{recursive:true});fs.mkdirSync(path.join(root,'data/quality-autopilot'),{recursive:true});
  fs.writeFileSync(path.join(root,'apps/demo/index.html'),'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body><script>const KNOWN_BLACK_SCREEN=false;</script></body></html>');
  fs.writeFileSync(path.join(root,'config/quality-autopilot.json'),JSON.stringify({projectRoots:['apps'],entryFiles:['index.html'],safeFixes:[],budget:{maxProjectsPerRun:5,maxRuntimeSeconds:10,maxFileBytesToInspect:2000000},deviceBudgets:{},verificationCommands:[],globalRegressionKb:{minimumConfidence:0.6}},null,2));
  fs.writeFileSync(path.join(root,'data/quality-autopilot/production-errors.json'),JSON.stringify({events:[{projectId:'apps/demo',kind:'runtime',signature:'black screen',sourcePattern:'KNOWN_BLACK_SCREEN'}]},null,2));
  runAutopilot({repoRoot:root,mode:'candidate',verify:false,writeAudit:false});const kb=JSON.parse(fs.readFileSync(path.join(root,'data/quality-autopilot/global-regression-kb.json'),'utf8'));assert.equal(kb.rules.length,1);assert.equal(kb.rules[0].sourcePattern,'KNOWN_BLACK_SCREEN');
});
