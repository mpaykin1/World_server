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
  const damage=x.chains.gameplay.find(n=>n.id==="gameplay.damage");
  assert.equal(normals.candidateStatus,"CONTROL_PROVEN");
  assert.equal(damage.candidateStatus,"CONTROL_PROVEN");
  assert.equal(normals.masterStatus,"TESTED");
  assert.equal(damage.masterStatus,"PARTIAL");
  assert.doesNotMatch(JSON.stringify(x.currentCandidate),/"ownerVerdict":"(?:SUCCESS|FAILURE)"/);
});

test("migration is score-neutral for session delta by recomputing baseline/current under v2",()=>{
  const x=ledger();
  assert.equal(x.migration.toMetricVersion,x.metricVersion);
  assert.equal(x.migration.sessionBaselineMaster,x.computed.masterWeight);
  assert.equal(x.migration.sessionBaselineCandidate,x.computed.candidateWeight);
});

test("canonical ledger and generated summary stay synchronized",()=>{
  const r=spawnSync(process.execPath,["tools/krieger-total-control/evidence-ledger.mjs","--check"],{encoding:"utf8"});
  assert.equal(r.status,0,r.stderr||r.stdout);
  const out=JSON.parse(r.stdout.trim());
  assert.equal(out.metricVersion,"krieger-total-control/v2-three-chain-100");
  assert.equal(out.masterWeight,22.857143);
  assert.equal(out.candidateWeight,28.492063);
});
