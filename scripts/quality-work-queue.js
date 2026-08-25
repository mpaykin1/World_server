#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd();
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8'));
const d=cfg.distributed||{};
const cmd=process.argv[2]||'enqueue';
const url=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
const key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const stateDir=path.join(ROOT,'.quality-autopilot-state');
const stateFile=path.join(stateDir,'queue-task.json');
const owner=String(process.env.QUALITY_AGENT_ID||process.env.GITHUB_RUN_ID||`local-${process.pid}`);
function arg(name,def=null){const x=process.argv.find(v=>v.startsWith(`--${name}=`));return x?x.slice(name.length+3):def}
function write(v){fs.mkdirSync(stateDir,{recursive:true});fs.writeFileSync(path.join(ROOT,'QUALITY_WORK_QUEUE.json'),JSON.stringify(v,null,2)+'\n');console.log(`[QUALITY_QUEUE] ${v.status}`)}
function localAppend(row){fs.mkdirSync(stateDir,{recursive:true});fs.appendFileSync(path.join(stateDir,'queue-fallback.jsonl'),JSON.stringify(row)+'\n')}
async function request(target,opt={}){const r=await fetch(`${url}${target}`,{...opt,headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...(opt.headers||{})},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`${r.status}: ${await r.text()}`);const t=await r.text();return t?JSON.parse(t):null}
(async()=>{
  if(!url||!key){const row={status:'FALLBACK_LOCAL_QUEUE',command:cmd,owner,at:new Date().toISOString()};localAppend(row);write(row);return}
  if(cmd==='enqueue'){
    const hour=new Date().toISOString().slice(0,13).replace(/[-T:]/g,'');
    const taskKey=arg('task-key',`quality:${process.env.GITHUB_SHA||'unknown'}:${hour}`);
    const priority=Math.max(1,Math.min(Number(arg('priority','100')),1000));
    const kind=arg('kind',d.queueKind||'quality');
    const payload={source:arg('source','monitor'),status:arg('status',null),runId:process.env.GITHUB_RUN_ID||null,sha:process.env.GITHUB_SHA||null};
    const body={task_key:taskKey,kind,priority,state:'queued',available_at:new Date().toISOString(),payload};
    const rows=await request(`/rest/v1/quality_autopilot_queue?on_conflict=task_key`,{method:'POST',headers:{prefer:'resolution=ignore-duplicates,return=representation'},body:JSON.stringify(body)});
    write({status:'QUEUED_OR_ALREADY_EXISTS',taskKey,rows:rows||[],at:new Date().toISOString()});return;
  }
  if(cmd==='claim'){
    const token=crypto.randomUUID(),kind=arg('kind',d.queueKind||'quality');
    const rows=await request('/rest/v1/rpc/quality_autopilot_claim_task',{method:'POST',body:JSON.stringify({p_owner:owner,p_token:token,p_ttl_seconds:Number(d.queueLeaseSeconds||3600),p_kind:kind})});
    const task=Array.isArray(rows)?rows[0]:null;
    if(!task){write({status:'QUEUE_EMPTY',claimed:false,owner});return}
    const rec={status:'TASK_CLAIMED',claimed:true,owner,token,task,at:new Date().toISOString()};fs.writeFileSync(stateFile,JSON.stringify(rec,null,2)+'\n');write(rec);return;
  }
  if(cmd==='complete'||cmd==='fail'){
    let s={};try{s=JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch(_){}
    if(!s.task?.id||!s.token){write({status:'NO_CLAIMED_TASK',completed:true});return}
    const next=cmd==='complete'?'done':'failed';
    const rows=await request(`/rest/v1/quality_autopilot_queue?id=eq.${encodeURIComponent(s.task.id)}&lease_token=eq.${encodeURIComponent(s.token)}`,{method:'PATCH',headers:{prefer:'return=representation'},body:JSON.stringify({state:next,lease_owner:null,lease_token:null,lease_until:null,updated_at:new Date().toISOString()})});
    try{fs.unlinkSync(stateFile)}catch(_){}
    write({status:next==='done'?'TASK_COMPLETED':'TASK_FAILED',rows:rows||[],at:new Date().toISOString()});return;
  }
  throw new Error(`unknown command ${cmd}`);
})().catch(e=>{write({status:'QUEUE_ERROR',command:cmd,error:String(e.message||e)});process.exit(74)});
