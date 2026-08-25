#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
if(process.env.QUALITY_ACCEPT_BASELINE!=='YES'){
  throw new Error('Refusing to move quality baseline. Set QUALITY_ACCEPT_BASELINE=YES only after verified release/user acceptance.');
}
cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/quality-regression-gate.js')],{stdio:'inherit'});
const load=rel=>JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'));
const score=load('data/quality-scorecard.json'),errors=load('data/error-prevention-registry.json'),golden=load('data/golden-components.json'),registry=load('data/app-release-registry.json');
const old=load('data/quality-baseline.json'),history=load('data/quality-history.json');
const metrics=Object.fromEntries(Object.entries(score.metrics||{}).map(([k,v])=>[k,Number(v.percent)]));
const protectedErrorIds=(errors.knownErrors||[]).filter(e=>e.status==='protected').map(e=>e.id).sort();
const releaseBlockerCount=(errors.knownErrors||[]).filter(e=>e.severity==='release-blocker'&&e.status!=='protected').length;
const goldenLocks=Object.fromEntries(Object.entries(golden.components||{}).filter(([,v])=>v.status==='golden').map(([k,v])=>[k,{canonical:v.canonical,status:v.status}]));
const certifiedApps=Object.fromEntries(Object.entries(registry.apps||{}).filter(([,v])=>v.status==='certified'&&v.visible===true).map(([k,v])=>[k,{required:[...(v.required||[])].sort(),visible:true,status:'certified'}]));
const criticalTests=[...new Set([...(old.criticalTests||[]),'e2e/golden-release.spec.js','test/quality-regression.test.js'])].sort();
const baseline={
  schemaVersion:'1.0.0',
  baselineId:`accepted-${new Date().toISOString().replace(/[:.]/g,'-')}`,
  baselineType:'verified-release',
  acceptedAt:new Date().toISOString(),
  acceptedCommit:process.env.GITHUB_SHA||process.env.VERCEL_GIT_COMMIT_SHA||'local-verified',
  metrics,
  technologyUsage:score.technologyUsage||{},
  releaseBlockerCount,
  protectedErrorIds,
  goldenLocks,
  certifiedApps,
  criticalTests
};
history.events=history.events||[];
history.events.push({type:'BASELINE_ACCEPTED',at:baseline.acceptedAt,baselineId:baseline.baselineId,commit:baseline.acceptedCommit,previousBaselineId:old.baselineId,metrics});
fs.writeFileSync(path.join(ROOT,'data/quality-baseline.json'),JSON.stringify(baseline,null,2)+'\n');
fs.writeFileSync(path.join(ROOT,'data/quality-history.json'),JSON.stringify(history,null,2)+'\n');
console.log(`[QUALITY_BASELINE] accepted ${baseline.baselineId}`);
