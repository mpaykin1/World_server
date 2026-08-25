'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd();

test('hardware fingerprint remains CPU-only and yields a supported class',()=>{
 const r=cp.spawnSync(process.execPath,['scripts/hardware-fingerprint.js'],{cwd:ROOT,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(fs.readFileSync('HARDWARE_QUALITY_PROFILE.json','utf8'));assert.equal(j.cpuOnly,true);assert.ok(['low','balanced','high'].includes(j.hardwareClass));
});

test('Bayesian predictor favors proven positive pattern over failed pattern',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bayes-'));fs.mkdirSync(path.join(tmp,'data'),{recursive:true});fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});
 for(const f of ['data/bayesian-quality-policy.json','scripts/bayesian-quality-predictor.js']){const d=path.join(tmp,f);fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(path.join(ROOT,f),d)}
 fs.writeFileSync(path.join(tmp,'data/quality-improvement-memory.json'),JSON.stringify({items:[
  {fingerprint:'good',actionKind:'golden',systemArea:'ui',attempts:5,successes:5,failures:0,cumulativeDelta:8,neverRetry:false},
  {fingerprint:'bad',actionKind:'hack',systemArea:'ui',attempts:5,successes:0,failures:5,cumulativeDelta:-5,neverRetry:true}
 ]}));
 const r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/bayesian-quality-predictor.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(fs.readFileSync(path.join(tmp,'BAYESIAN_QUALITY_PREDICTION.json'),'utf8'));assert.equal(j.top[0].fingerprint,'good');fs.rmSync(tmp,{recursive:true,force:true});
});

test('30-night calibration creates verified candidate but does not self-promote',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cal-'));fs.mkdirSync(path.join(tmp,'data'),{recursive:true});fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});
 for(const f of ['data/self-calibration-policy.json','scripts/quality-self-calibration.js']){const d=path.join(tmp,f);fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(path.join(ROOT,f),d)}
 fs.writeFileSync(path.join(tmp,'QUALITY_NIGHT_HISTORY.json'),JSON.stringify({nights:Array.from({length:30},(_,i)=>({cpuMinutes:200+i%20,qualityDelta:.2,totalJobs:10,failedJobs:1}))}));
 const r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/quality-self-calibration.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const j=JSON.parse(fs.readFileSync(path.join(tmp,'SELF_CALIBRATION_REPORT.json'),'utf8'));assert.equal(j.status,'CALIBRATED_30_NIGHTS');assert.equal(j.candidate.promotionRequired,true);assert.equal(j.candidate.confidence,1);fs.rmSync(tmp,{recursive:true,force:true});
});

test('night checkpoint saves loads and clears state',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cp-'));fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});fs.copyFileSync(path.join(ROOT,'scripts/night-checkpoint.js'),path.join(tmp,'scripts/night-checkpoint.js'));
 let r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/night-checkpoint.js'),'save','job-1','{"generation":4}'],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/night-checkpoint.js'),'load','job-1'],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).generation,4);
 r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/night-checkpoint.js'),'clear','job-1'],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);fs.rmSync(tmp,{recursive:true,force:true});
});

test('test cache returns a cache hit for identical command+inputs',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cache-'));fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});fs.copyFileSync(path.join(ROOT,'scripts/test-cache-runner.js'),path.join(tmp,'scripts/test-cache-runner.js'));fs.writeFileSync(path.join(tmp,'x.txt'),'same');
 let env={...process.env,QUALITY_TEST_INPUTS:'x.txt'};let r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/test-cache-runner.js'),'node -e "process.exit(0)"'],{cwd:tmp,encoding:'utf8',env});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/test-cache-runner.js'),'node -e "process.exit(0)"'],{cwd:tmp,encoding:'utf8',env});assert.equal(r.status,0,r.stderr);assert.match(r.stdout,/HIT/);fs.rmSync(tmp,{recursive:true,force:true});
});
