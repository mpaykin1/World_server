'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
const {evaluateTelemetry}=require('../lib/quality/telemetry-gate');
const {decideCanary}=require('../lib/quality/canary-controller');
const {rankCandidates,paretoFront}=require('../lib/quality/tournament');
const {clusterFailures}=require('../lib/quality/root-cause');
const {appendAudit,verifyAudit}=require('../lib/quality/audit-chain');
const {compileRegressionTests}=require('../lib/quality/error-to-regression');
const {inspectUnifiedDiff}=require('../lib/quality/candidate-sandbox');
const {scanSecurity}=require('../lib/quality/security-gate');
const {detectEngine,goldenCompatible}=require('../lib/quality/engine-adapters');

test('telemetry gate promotes equal/better candidate and rolls back regression',()=>{
  const base={fpsP50:60,fpsP95:45,crashRate:0.001,errorRate:0.01,p95LatencyMs:500,memoryMb:300,webglContextLossRate:0};
  assert.equal(evaluateTelemetry(base,{...base,fpsP50:61,memoryMb:290}).status,'promote');
  assert.equal(evaluateTelemetry(base,{...base,fpsP50:20}).status,'rollback');
});

test('canary holds before enough evidence then promotes',()=>{
  const m={fpsP50:60,fpsP95:45,crashRate:0,errorRate:0,p95LatencyMs:500,memoryMb:300,webglContextLossRate:0};
  assert.equal(decideCanary({baseline:m,canary:m,sessions:3,elapsedMinutes:2}).decision,'hold');
  assert.equal(decideCanary({baseline:m,canary:m,sessions:30,elapsedMinutes:15}).decision,'promote');
});

test('tournament rejects regressed candidate and keeps pareto options',()=>{
  const r=rankCandidates([{id:'bad',score:100,regression:'x'},{id:'good',score:95,metrics:{integrity:100}}],{integrity:0.1});
  assert.equal(r.winner.id,'good');
  assert.ok(paretoFront([{id:'a',score:90,integrity:90},{id:'b',score:95,integrity:95}],['score','integrity']).some(x=>x.id==='b'));
});

test('root cause clustering groups numeric variants',()=>{
  const c=clusterFailures([{kind:'http',message:'failed 500 request 123',projectId:'a'},{kind:'http',message:'failed 404 request 999',projectId:'b'}]);
  assert.equal(c.length,1); assert.equal(c[0].count,2);
});

test('audit chain detects tampering',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-audit-'));appendAudit(root,{x:1},'s');appendAudit(root,{x:2},'s');const file=path.join(root,'data/quality-autopilot/audit-chain.jsonl');assert.equal(verifyAudit(file,'s').ok,true);const t=fs.readFileSync(file,'utf8').replace('"x":1','"x":9');fs.writeFileSync(file,t);assert.equal(verifyAudit(file,'s').ok,false);
});

test('production error compiles into executable regression test source',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-reg-'));fs.mkdirSync(path.join(root,'apps/demo'),{recursive:true});fs.writeFileSync(path.join(root,'apps/demo/app.js'),'const ok=true;\n');const r=compileRegressionTests(root,[{projectId:'apps/demo',sourceFile:'apps/demo/app.js',sourcePattern:'KNOWN_BAD',signature:'bug'}]);assert.equal(r.cases,1);assert.match(fs.readFileSync(r.file,'utf8'),/KNOWN_BAD/);
});

test('candidate sandbox blocks protected and oversized patches',()=>{
  const diff='diff --git a/.env b/.env\n--- a/.env\n+++ b/.env\n+SECRET=1\n';const r=inspectUnifiedDiff(diff,{maxFiles:2,maxChangedLines:10,neverMutate:['.env']});assert.equal(r.ok,false);assert.ok(r.violations.some(x=>x.startsWith('protected-file')));
});

test('security gate detects private keys',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-sec-'));const f=path.join(root,'x.txt');fs.writeFileSync(f,'-----BEGIN '+'PRIVATE KEY-----\nabc');const r=scanSecurity([f],root);assert.equal(r.ok,false);
});

test('engine adapter detects Godot and golden compatibility expiry',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'qa-eng-'));const f=path.join(root,'project.godot');fs.writeFileSync(f,'[application]\n');const e=detectEngine({dir:root,files:[f]});assert.equal(e.engine,'godot');assert.equal(goldenCompatible({engines:['godot'],expiresAt:new Date(Date.now()+10000).toISOString()},e),true);assert.equal(goldenCompatible({engines:['webgl']},e),false);
});
