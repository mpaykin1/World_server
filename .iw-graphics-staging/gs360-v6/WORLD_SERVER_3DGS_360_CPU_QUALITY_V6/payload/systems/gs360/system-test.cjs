#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');
const here=__dirname;const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'gs360-v6-system-'));let passed=0;const checks=[];
function run(name,args,cwd=tmp,expect=0){const r=spawnSync(process.execPath,args,{encoding:'utf8',cwd});const ok=r.status===expect;checks.push({name,ok,status:r.status,stdout:(r.stdout||'').slice(-1200),stderr:(r.stderr||'').slice(-1200)});if(!ok){console.error(JSON.stringify(checks,null,2));process.exit(10);}passed++;return r;}
try{
  run('backend-registry',[path.join(here,'backend-registry.cjs'),tmp]);
  run('depth-registry',[path.join(here,'depth-registry.cjs'),tmp]);
  run('license-gate',[path.join(here,'license-gate.cjs'),tmp]);
  run('resource-advisor',[path.join(here,'resource-advisor.cjs'),tmp]);
  for(const f of ['GS360_BACKEND_REGISTRY.json','GS360_DEPTH_REGISTRY.json','GS360_LICENSE_GATE.json','GS360_RESOURCE_PLAN.json'])if(!fs.existsSync(path.join(tmp,f)))throw new Error(f+' missing');
  const input=path.join(tmp,'dummy.png');fs.writeFileSync(input,'x');const out=path.join(tmp,'job-out');
  const fp=run('fingerprint',[path.join(here,'fingerprint.cjs'),'--input',input,'--output',out]);if(!fp.stdout.includes('fingerprint'))throw new Error('fingerprint missing');
  run('queue-add',[path.join(here,'job-queue.cjs'),'add','--root',tmp,'--input',input,'--output',out,'--preference','approximate']);
  const r2=run('queue-dedupe',[path.join(here,'job-queue.cjs'),'add','--root',tmp,'--input',input,'--output',out,'--preference','approximate']);if(!r2.stdout.includes('ALREADY_QUEUED'))throw new Error('queue dedupe failed');
  const qpath=path.join(tmp,'.world-server','gs360','JOB_QUEUE.json');const q=JSON.parse(fs.readFileSync(qpath,'utf8'));q.jobs[0].status='running';q.jobs[0].startedAt='2000-01-01T00:00:00.000Z';fs.writeFileSync(qpath,JSON.stringify(q,null,2)+'\n');
  run('queue-recover',[path.join(here,'job-queue.cjs'),'recover-stale','--root',tmp,'--stale-seconds','60']);const q2=JSON.parse(fs.readFileSync(qpath,'utf8'));if(q2.jobs[0].status!=='pending')throw new Error('stale job not recovered');
  const appr=path.join(tmp,'approx');fs.mkdirSync(appr,{recursive:true});fs.writeFileSync(path.join(appr,'GS360_MANIFEST.json'),JSON.stringify({selected_preference:'approximate',quality_contract:{trained_3dgs:false}},null,2));
  const gameDir=path.join(appr,'game');fs.mkdirSync(gameDir,{recursive:true});fs.writeFileSync(path.join(gameDir,'seed_gaussians.ply'),'ply\nformat ascii 1.0\nelement vertex 0\nend_header\n');
  run('trainer-skip-approximate',[path.join(here,'trainer-runner.cjs'),'--output',appr]);
  run('optimizer-safe-fallback',[path.join(here,'splat-optimizer.cjs'),'--output',appr,'--target','auto']);if(!fs.existsSync(path.join(appr,'GS360_OPTIMIZATION_REPORT.json')))throw new Error('optimizer report missing');
  run('wait-helper',[path.join(here,'wait-and-verify.cjs'),'--wait','1','--check',`${JSON.stringify(process.execPath)} -e "process.exit(0)"`,'--retries','1']);
  console.log(JSON.stringify({pass:true,passed,checks:checks.map(x=>({name:x.name,ok:x.ok}))},null,2));
}finally{try{fs.rmSync(tmp,{recursive:true,force:true});}catch{}}
