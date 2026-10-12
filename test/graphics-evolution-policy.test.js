'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const policy=require('../data/graphics-evolution-policy.json');
const {evaluateEvidence,validatePolicy}=require('../scripts/check-graphics-evolution.cjs');
const h='a'.repeat(64),c='b'.repeat(64),r='c'.repeat(64);
const proof=(scores)=>({sourceTask:'GRAPHICS-DEMO-001',sourceSha:h,candidateSha:c,referenceSha256:r,sceneMatches:true,captures:[{kind:'control',sha256:h,device:'desktop'},{kind:'holdout',sha256:c,device:'mobile'}],playable:true,controls:{keyboard:true,touch:true,collision:true},animationsObserved:true,criticalRegressions:0,performanceRegressed:false,independentFleet:{reviewer:'Fleet',scores}});
const good={terrain:18,assetsAndStyle:23,depthAndLight:18,composition:13,animation:9,traversal:9};
test('valid canonical 50/50 policy leaves failed MVP open',()=>{assert.equal(validatePolicy(policy),true);assert.equal(evaluateEvidence(policy,null).state,'UNKNOWN')});
test('50/50, role count, user authority and per-axis thresholds cannot silently weaken',()=>{
 for(const change of [p=>p.workAllocation.cleanServerPercent=80,p=>p.roles.push('Sixth'),p=>p.minimumOverall=60,p=>p.review.independentFleetRequired=false,p=>p.status='PASS']){const p=structuredClone(policy);change(p);assert.throws(()=>validatePolicy(p));}
});
test('independent control/holdout and gameplay are required',()=>{
 const q=proof(good);q.captures=[];assert.equal(evaluateEvidence(policy,q).state,'UNKNOWN');
 const w=proof(good);w.playable=false;assert.equal(evaluateEvidence(policy,w).state,'BLOCKED');
 const z=proof(good);z.independentFleet.reviewer='Builder';assert.equal(evaluateEvidence(policy,z).state,'UNKNOWN');
});
test('high overall cannot hide low axis and no unrequested owner PASS',()=>{
 const weak={...good,animation:2};assert.equal(evaluateEvidence(policy,proof(weak)).state,'NEEDS_MORE_ITERATION');
 assert.equal(evaluateEvidence(policy,proof(good)).state,'AWAITING_OWNER_VERDICT');
 const accepted=structuredClone(policy);accepted.ownerAcceptance={verdict:'PASS'};accepted.status='PASS';
 assert.equal(evaluateEvidence(accepted,proof(good)).state,'NEXT_VISUAL_EVOLUTION');
});
test('regression cannot be compensated by pretty screenshots',()=>{
 const p=proof(good);p.performanceRegressed=true;assert.equal(evaluateEvidence(policy,p).state,'BLOCKED');
});
