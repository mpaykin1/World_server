'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process');
const ROOT=process.cwd();

test('policy permanently forbids GPU and paid compute',()=>{
 const p=JSON.parse(fs.readFileSync(path.join(ROOT,'data/silent-cpu-autopilot-policy.json'),'utf8'));
 assert.equal(p.hardConstraints.gpuAllowed,false);assert.equal(p.hardConstraints.paidGpuAllowed,false);assert.equal(p.hardConstraints.paidComputeAllowed,false);assert.equal(p.costBudget.paidComputeUnits,0);
});

test('task planner only produces free CPU tasks',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cpu-auto-'));
 for(const d of ['data','scripts'])fs.mkdirSync(path.join(tmp,d),{recursive:true});
 for(const f of ['data/silent-cpu-autopilot-policy.json','data/autopilot-projects.json','data/quality-improvement-memory.json','scripts/autopilot-project-priority.js','scripts/autopilot-task-planner.js']){const s=path.join(ROOT,f),d=path.join(tmp,f);fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(s,d)}
 let r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/autopilot-project-priority.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/autopilot-task-planner.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const plan=JSON.parse(fs.readFileSync(path.join(tmp,'AUTOPILOT_TASK_PLAN.json'),'utf8'));assert.ok(plan.tasks.length>0);
 for(const t of plan.tasks){assert.equal(t.requiresGpu,false);assert.equal(Number(t.estimatedPaidCost),0);assert.ok(Number(t.estimatedCpuSeconds)>0)}
 fs.rmSync(tmp,{recursive:true,force:true});
});

test('learner marks repeatedly bad deterministic action never-retry',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'cpu-learn-'));fs.mkdirSync(path.join(tmp,'data'),{recursive:true});fs.mkdirSync(path.join(tmp,'scripts'),{recursive:true});
 for(const f of ['data/cpu-night-learning-model.json','data/quality-improvement-memory.json','scripts/cpu-quality-learner.js']){const d=path.join(tmp,f);fs.mkdirSync(path.dirname(d),{recursive:true});fs.copyFileSync(path.join(ROOT,f),d)}
 const events={events:[0,1,2].map(()=>({fingerprint:'badfix',actionKind:'safe_autofix',systemArea:'controls',qualityDelta:-1,passedAllGates:false}))};fs.writeFileSync(path.join(tmp,'QUALITY_LEARNING_EVENTS.json'),JSON.stringify(events));
 const r=cp.spawnSync(process.execPath,[path.join(tmp,'scripts/cpu-quality-learner.js')],{cwd:tmp,encoding:'utf8'});assert.equal(r.status,0,r.stderr);
 const mem=JSON.parse(fs.readFileSync(path.join(tmp,'data/quality-improvement-memory.json'),'utf8'));assert.equal(mem.items.find(x=>x.fingerprint==='badfix').neverRetry,true);
 fs.rmSync(tmp,{recursive:true,force:true});
});
