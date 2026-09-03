#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildTask, sha256, nowIso, hmac } = require('../lib/browser-local-control');

const ROOT = path.resolve(__dirname,'..');
const QUEUE_DIR = path.join(ROOT,'state/browser-local-queue');
const RESULTS_DIR = path.join(ROOT,'state/browser-local-results');

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function writeTask(task){
  ensureDir(QUEUE_DIR);
  const fp = path.join(QUEUE_DIR, `${task.task_id}.json`);
  if (fs.existsSync(fp)) {
    // idempotency: check idempotency_key
    const existing = JSON.parse(fs.readFileSync(fp,'utf8'));
    if (existing.idempotency_key === task.idempotency_key) {
      console.log(JSON.stringify({ ok:true, deduplicated:true, task: existing },null,2));
      return existing;
    }
  }
  // optional hmac
  const secret = String(process.env.BROWSER_CONTROL_SECRET||'').trim();
  if (secret) task.signature = hmac(task.task_id, task.capability, task.args, secret);
  fs.writeFileSync(fp, JSON.stringify(task,null,2),'utf8');
  console.log(JSON.stringify({ ok:true, deduplicated:false, task },null,2));
  return task;
}

async function enqueue(capability, args, opts={}){
  const t = buildTask({ capability, args, ...opts });
  return writeTask(t);
}
async function getTask(taskId){
  const p = path.join(QUEUE_DIR, `${taskId}.json`);
  if(!fs.existsSync(p)) { console.log(JSON.stringify({ ok:false, error:'not found' })); return null; }
  const j = JSON.parse(fs.readFileSync(p,'utf8'));
  console.log(JSON.stringify({ ok:true, task:j },null,2));
  return j;
}
async function getResult(taskId){
  const p = path.join(RESULTS_DIR, `${taskId}.json`);
  if(!fs.existsSync(p)) {
    const q = path.join(QUEUE_DIR, `${taskId}.json`);
    if(fs.existsSync(q)){ const j=JSON.parse(fs.readFileSync(q,'utf8')); console.log(JSON.stringify({ ok:false, error:'not finished', status:j.status },null,2)); return null; }
    console.log(JSON.stringify({ ok:false, error:'not found'})); return null;
  }
  const j = JSON.parse(fs.readFileSync(p,'utf8'));
  console.log(JSON.stringify({ ok:true, task_id:j.task_id, status:j.status, result:j.result },null,2));
  return j;
}
async function list(){
  ensureDir(QUEUE_DIR);
  const files = fs.readdirSync(QUEUE_DIR).filter(f=>f.endsWith('.json'));
  const arr = files.map(f=> JSON.parse(fs.readFileSync(path.join(QUEUE_DIR,f),'utf8'))).map(t=>({ task_id:t.task_id, capability:t.capability, status:t.status, created_at:t.created_at, idempotency_key:t.idempotency_key }));
  console.log(JSON.stringify({ ok:true, count:arr.length, tasks:arr },null,2));
}
async function cancel(taskId){
  const p = path.join(QUEUE_DIR, `${taskId}.json`);
  if(!fs.existsSync(p)){ console.log(JSON.stringify({ ok:false, error:'not found'})); return; }
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  if(!['queued','running'].includes(j.status)){ console.log(JSON.stringify({ ok:false, error:'not cancellable', status:j.status})); return; }
  j.status='cancelled'; j.finished_at=nowIso(); j.updated_at=nowIso();
  fs.writeFileSync(p, JSON.stringify(j,null,2),'utf8');
  const rp = path.join(RESULTS_DIR, `${taskId}.json`);
  ensureDir(RESULTS_DIR); fs.writeFileSync(rp, JSON.stringify(j,null,2),'utf8');
  console.log(JSON.stringify({ ok:true, task_id:taskId, status:'cancelled'},null,2));
}

async function main(){
  const cmd = String(process.argv[2]||'').toLowerCase();
  if(cmd==='enqueue'){
    const cap = process.argv[3];
    const argsJson = process.argv[4] || '{}';
    const idem = process.argv[5] || null;
    if(!cap){ console.error('usage: node scripts/browser-local-queue.cjs enqueue <capability> [argsJson] [idempotencyKey]'); process.exit(2); }
    let args={}; try{ args=JSON.parse(argsJson); }catch(e){ console.error('invalid argsJson'); process.exit(2); }
    await enqueue(cap, args, idem?{idempotency_key:idem}:{} );
  } else if(cmd==='get'){ await getTask(process.argv[3]); }
  else if(cmd==='result'){ await getResult(process.argv[3]); }
  else if(cmd==='list'){ await list(); }
  else if(cmd==='cancel'){ await cancel(process.argv[3]); }
  else { console.log('commands: enqueue <cap> [argsJson] [idem], get <taskId>, result <taskId>, list, cancel <taskId>'); }
}
if(require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
module.exports={ enqueue, getTask, getResult };
