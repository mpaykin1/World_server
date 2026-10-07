import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {spawnSync} from "node:child_process";

const ledger=()=>JSON.parse(fs.readFileSync("data/krieger-total-control-evidence-ledger.json","utf8"));

test("metric v2 covers render, gameplay and native authoring with fixed 100-point weights",()=>{
  const x=ledger();
  assert.equal(x.metricVersion,"krieger-total-control/v2-three-chain-100");
  assert.deepEqual(x.scoring.chainWeights,{graphics:40,gameplay:25,nativeAuthoring:35});
  assert.equal(Object.values(x.scoring.chainWeights).reduce((a,b)=>a+b,0),100);
  assert.equal(x.chains.graphics.length,14);
  assert.equal(x.chains.gameplay.length,9);
  assert.equal(x.chains.nativeAuthoring.length,17);
  assert.equal(x.computed.totalNodes,40);
  assert.equal(x.metricHistory[0].metricVersion,"krieger-total-control/v1-equal-23");
  assert.equal(x.metricHistory[0].lastCanonicalScore,17.391304);
});

test("technical CONTROL_PROVEN is independent from owner SUCCESS/FAILURE",()=>{
  const x=ledger();
  assert.equal(x.currentCandidate.ownerVerdict,"UNSET");
  const normals=x.chains.graphics.find(n=>n.id==="graphics.normals");
  const input=x.chains.gameplay.find(n=>n.id==="gameplay.input");
  const damage=x.chains.gameplay.find(n=>n.id==="gameplay.damage");
  for(const n of [normals,input,damage]){
    assert.equal(n.masterStatus,"CONTROL_PROVEN",n.id);
    assert.equal(n.candidateStatus,"CONTROL_PROVEN",n.id);
  }
  for(const id of ["native.game_recipe","native.krieger_ir","native.kx_operator_graph","native.parameter_binding","native.geometry","native.serialization","native.build_wasm","native.run"]){
    const node=x.chains.nativeAuthoring.find(n=>n.id===id);
    assert.equal(node.masterStatus,"CONTROL_PROVEN",id);
    assert.equal(node.candidateStatus,"CONTROL_PROVEN",id);
  }
  assert.doesNotMatch(JSON.stringify(x.currentCandidate),/"ownerVerdict":"(?:SUCCESS|FAILURE)"/);
});

test("migration is score-neutral for session delta by recomputing baseline/current under v2",()=>{
  const x=ledger();
  assert.equal(x.migration.toMetricVersion,x.metricVersion);
  assert.equal(x.migration.sessionBaselineMaster,x.migration.sessionBaselineCandidate);
  assert.ok(x.computed.masterWeight>=x.migration.sessionBaselineMaster);
  assert.ok(x.computed.candidateWeight>=x.computed.masterWeight);
});

test("canonical ledger and generated summary stay synchronized",()=>{
  const r=spawnSync(process.execPath,["tools/krieger-total-control/evidence-ledger.mjs","--check"],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
  const out=JSON.parse(r.stdout.trim());
  assert.equal(out.metricVersion,"krieger-total-control/v2-three-chain-100");
  const x=ledger();
  assert.equal(out.masterWeight,x.computed.masterWeight);
  assert.equal(out.candidateWeight,x.computed.candidateWeight);
  if(/PENDING_EXACT_HEAD/.test(x.currentCandidate.state||"")) assert.equal(out.candidateWeight,out.masterWeight);
});


test("metric migration is safe to rerun against an already-v2 ledger",()=>{
  const source=fs.readFileSync("tools/krieger-total-control/migrate-metric-v2.mjs","utf8");
  assert.match(source,/node\.status\?\?node\.masterStatus\?\?node\.candidateStatus\?\?"UNKNOWN"/);
});

test("technical evidence ids are unique and scoped negative evidence stays explicit",()=>{
  const x=ledger();
  const ids=(x.technicalEvidence||[]).map(e=>e.id);
  assert.equal(new Set(ids).size,ids.length,"duplicate technical evidence id");
  const negatives=new Map((x.negativeEvidence||[]).map(e=>[e.id,e]));
  assert.equal(negatives.get("wasm-baseline-asan-2026-10-05")?.status,"OPEN_CLASSIFIED");
  assert.equal(negatives.get("damage-pointer-lock-2026-10-06")?.status,"OPEN_CLASSIFIED");
  assert.equal(x.currentCandidate.ownerVerdict,"UNSET");
});
