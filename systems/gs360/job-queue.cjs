#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const here=__dirname; const argv=process.argv.slice(2); const action=argv[0]||'status';
function value(name,f=null){const i=argv.indexOf(name);return i>=0&&i+1<argv.length?argv[i+1]:f;}
function valuesAfter(name){const i=argv.indexOf(name);if(i<0)return[];const out=[];for(let j=i+1;j<argv.length&&!argv[j].startsWith('--');j++)out.push(argv[j]);return out;}
const root=path.resolve(value('--root',process.cwd())); const stateDir=path.join(root,'.world-server','gs360'); const queuePath=path.join(stateDir,'JOB_QUEUE.json'); const dlqPath=path.join(stateDir,'DEAD_LETTER_QUEUE.json');
function load(p,d){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return d;}} function save(p,o){fs.mkdirSync(path.dirname(p),{recursive:true});const t=p+'.tmp';fs.writeFileSync(t,JSON.stringify(o,null,2)+'\n');fs.renameSync(t,p);} function now(){return new Date().toISOString();}
function queue(){return load(queuePath,{schema:'world-server.gs360-job-queue/v1',jobs:[]});}
function normalizeForHash(o){return JSON.stringify(o,Object.keys(o).sort());}
if(action==='add'){
  const inputs=valuesAfter('--input').map(x=>path.resolve(x)); const output=value('--output'); if(!inputs.length||!output){console.error('usage: job-queue.cjs add --input <files...> --output <dir> [--preference auto]');process.exit(2);}
  const delaySeconds=Math.max(0,Number(value('--delay-seconds','0'))||0); const spec={inputs,output:path.resolve(output),preference:value('--preference','auto'),retries:Number(value('--retries','2'))||2,priority:Number(value('--priority','0'))||0,postWait:Number(value('--post-wait','0'))||0,postCheck:value('--post-check',''),notBefore:delaySeconds>0?new Date(Date.now()+delaySeconds*1000).toISOString():null};
  const id=crypto.createHash('sha256').update(JSON.stringify(spec)).digest('hex').slice(0,16); const q=queue(); const existing=q.jobs.find(j=>j.id===id&&j.status!=='failed'); if(existing){console.log(JSON.stringify({pass:true,status:'ALREADY_QUEUED',job:existing},null,2));process.exit(0);}
  const job={id,status:'pending',attempts:0,maxAttempts:spec.retries+1,createdAt:now(),updatedAt:now(),spec};q.jobs.push(job);save(queuePath,q);console.log(JSON.stringify({pass:true,status:'QUEUED',job},null,2));process.exit(0);
}
if(action==='recover-stale'||action==='run-next'){
  const q=queue(); const staleMs=Math.max(60,Number(value('--stale-seconds','3600')))*1000; const t=Date.now(); let recovered=0;
  for(const j of q.jobs){if(j.status==='running'&&j.startedAt&&t-Date.parse(j.startedAt)>staleMs){j.status='pending';j.updatedAt=now();j.lastError='recovered_stale_running_job';recovered++;}}
  save(queuePath,q); if(action==='recover-stale'){console.log(JSON.stringify({pass:true,recovered,queuePath},null,2));process.exit(0);}
  const due=q.jobs.filter(j=>j.status==='pending'&&(!j.spec?.notBefore||Date.parse(j.spec.notBefore)<=Date.now())).sort((a,b)=>(Number(b.spec?.priority||0)-Number(a.spec?.priority||0))||(Date.parse(a.createdAt)-Date.parse(b.createdAt))); const job=due[0]; if(!job){const future=q.jobs.filter(j=>j.status==='pending'&&j.spec?.notBefore).map(j=>j.spec.notBefore).sort()[0]||null;console.log(JSON.stringify({pass:true,status:future?'WAITING_FOR_DUE_TIME':'EMPTY',nextDue:future,recovered,queuePath},null,2));process.exit(0);}
  job.status='running';job.attempts++;job.startedAt=now();job.updatedAt=now();save(queuePath,q);
  const a=[path.join(here,'autopilot.cjs'),'--input',...job.spec.inputs,'--output',job.spec.output,'--preference',job.spec.preference,'--retries',String(job.spec.retries),'--resume'];
  if(job.spec.postWait>0)a.push('--post-wait',String(job.spec.postWait)); if(job.spec.postCheck)a.push('--post-check',job.spec.postCheck);
  const r=spawnSync(process.execPath,a,{encoding:'utf8',cwd:root});job.updatedAt=now();job.finishedAt=now();job.lastStdout=(r.stdout||'').slice(-8000);job.lastStderr=(r.stderr||'').slice(-8000);
  if(r.status===0){job.status='completed';job.completedAt=now();}
  else if(job.attempts<job.maxAttempts){job.status='pending';job.lastError=`autopilot_exit_${r.status}`;}
  else{job.status='dead_letter';job.lastError=`autopilot_exit_${r.status}`;const dlq=load(dlqPath,{schema:'world-server.gs360-dlq/v1',jobs:[]});dlq.jobs.push({...job,deadLetteredAt:now()});save(dlqPath,dlq);}
  save(queuePath,q);console.log(JSON.stringify({pass:r.status===0,status:job.status,jobId:job.id,attempts:job.attempts,queuePath,dlqPath},null,2));process.exit(r.status===0?0:10);
}
if(action==='retry-dead'){
 const id=value('--id'); const q=queue(); const j=q.jobs.find(x=>x.id===id&&x.status==='dead_letter'); if(!j){console.error('dead-letter job not found');process.exit(3);} j.status='pending';j.attempts=0;j.updatedAt=now();save(queuePath,q);console.log(JSON.stringify({pass:true,status:'REQUEUED',job:j},null,2));process.exit(0);
}
const q=queue();const counts={};for(const j of q.jobs)counts[j.status]=(counts[j.status]||0)+1;console.log(JSON.stringify({pass:true,queuePath,counts,jobs:q.jobs.slice(-20)},null,2));
