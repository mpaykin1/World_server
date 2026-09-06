'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os');
const {run}=require('../scripts/long-soak-runner.cjs');
test('elapsed synthetic harness time cannot certify a real eight-hour soak',async t=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'soak-proof-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));const statePath=path.join(dir,'state.json'),reportFile=`work/soak-fixture-${process.pid}.json`;fs.mkdirSync(path.join(__dirname,'../work'),{recursive:true});t.after(()=>fs.rmSync(path.join(__dirname,'..',reportFile),{force:true}));
 fs.writeFileSync(statePath,JSON.stringify({startedAt:new Date(Date.now()-9*3600000).toISOString(),events:[{recovered:true}]}));const r=await run({hours:8,resume:true,statePath,reportFile});assert.equal(r.longSoakCertified,false);assert.equal(r.evidenceKind,'synthetic-harness');
});

test('real runtime runner stops before spawning when resource floor cannot be met',async t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'soak-resource-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const r=await require('../scripts/lib/runtime-soak.cjs').runRuntime({root,durationMs:1000,minFreeRatio:2});assert.equal(r.pass,false);assert.equal(r.requests,0);assert.equal(r.restarts,0);assert.match(r.failures[0],/resource-gated/);
});
