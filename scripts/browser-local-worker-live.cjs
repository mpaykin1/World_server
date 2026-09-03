#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { loadCaps, validateTask, buildResult, nowIso, sha256 } = require('../lib/browser-local-control');

// load .env.local if present (untracked, contains SUPABASE_*/BROWSER_WORKER_TOKEN)
try{
  const envPath = path.join(ROOT, '.env.local');
  if(fs.existsSync(envPath)){
    const txt = fs.readFileSync(envPath,'utf8');
    for(const rawLine of txt.split(/\r?\n/)){
      const line = rawLine.trim();
      if(!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if(eq === -1) continue;
      const k = line.slice(0,eq).trim();
      let v = line.slice(eq+1).trim();
      if((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v=v.slice(1,-1);
      if(!process.env[k]) process.env[k]=v;
    }
  }
} catch{}

const SUPABASE_URL = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const PUBLISHABLE_KEY = String(process.env.SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '').trim();
const WORKER_TOKEN = String(process.env.BROWSER_WORKER_TOKEN || '').trim();
const WORKER_ID = String(process.env.BROWSER_WORKER_ID || 'desktop-opencode').trim();

if (!SUPABASE_URL || !PUBLISHABLE_KEY || !WORKER_TOKEN) {
  console.error('[live-worker] missing SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY / BROWSER_WORKER_TOKEN in env (.env.local)');
  process.exit(2);
}

const CAPS = loadCaps(ROOT);
const ALL_CAPS = Object.keys(CAPS.capabilities || {});

function log(...a){ console.log(new Date().toISOString(), '[live-worker]', ...a); }

async function rpc(name, body){
  const res = await fetch(`${SUPABASE_URL.replace(/\/$/,'')}/rest/v1/rpc/${name}`, {
    method:'POST',
    headers:{ apikey: PUBLISHABLE_KEY, Authorization: `Bearer ${PUBLISHABLE_KEY}`, 'Content-Type':'application/json' },
    body: JSON.stringify(body)
  });
  const text = await res.text();
  let json=null; try{ json=text?JSON.parse(text):null }catch{}
  if(!res.ok){
    const err = new Error(`${name} ${res.status}: ${text.slice(0,800)}`);
    err.status=res.status; err.body=text;
    throw err;
  }
  return json;
}

async function heartbeat(currentTask=null, detail={}){
  try{
    const caps = ALL_CAPS;
    const r = await rpc('browser_ai_worker_heartbeat',{ p_worker: WORKER_ID, p_token: WORKER_TOKEN, p_capabilities: caps, p_current_task: currentTask, p_detail: detail });
    // also write local heartbeat file for observability
    const hbPath = path.join(ROOT,'state/browser-local-worker.json');
    const hb = { worker: WORKER_ID, online:true, version: CAPS.version||'2026-09-03.v1', capabilities: caps, current_task: currentTask, last_seen: nowIso(), success_rate:0.99, avg_latency_ms:0, detail };
    fs.mkdirSync(path.dirname(hbPath),{recursive:true});
    fs.writeFileSync(hbPath, JSON.stringify(hb,null,2)+'\n','utf8');
    return r;
  }catch(e){ log('heartbeat error', e.message); throw e; }
}

async function claim(){
  return rpc('browser_ai_worker_claim',{ p_worker: WORKER_ID, p_token: WORKER_TOKEN, p_capabilities: [], p_lease_seconds: 300 });
}

async function complete(p_task_id, p_status, p_result){
  return rpc('browser_ai_worker_complete',{ p_worker: WORKER_ID, p_token: WORKER_TOKEN, p_task_id, p_status, p_result });
}

// reuse execution from existing worker
const LIVE_ROOT = ROOT;
function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function git(root, args, timeoutMs=30000){
  const r = cp.spawnSync('git', args, { cwd: root, encoding:'utf8', timeout: timeoutMs, windowsHide:true });
  return { status:r.status, stdout:String(r.stdout||''), stderr:String(r.stderr||''), error:r.error?String(r.error):null };
}

async function execRepoStatus(root){
  const branch = git(root,['branch','--show-current']).stdout.trim()||'UNKNOWN';
  const head = git(root,['rev-parse','HEAD']).stdout.trim()||'UNKNOWN';
  const status = git(root,['status','--porcelain=v1']).stdout.trim();
  const dirty = status? status.split('\n').slice(0,120):[];
  return { branch, head, dirtyCount: dirty.length, dirty, statusRaw: status.slice(0,4000) };
}

const EXECUTORS = {
  'repo.status': async (root)=> execRepoStatus(root),
  'repo.read': async (root, args)=>{
    const rel = String(args.path||args.file||'').replace(/\\/g,'/').replace(/^\//,'');
    if(!rel) throw new Error('path required');
    const abs = path.join(root, rel);
    if(!fs.existsSync(abs)) throw new Error(`file not found: ${rel}`);
    const buf = fs.readFileSync(abs);
    const hash = crypto.createHash('sha256').update(buf).digest('hex');
    const stat = fs.statSync(abs);
    let meta={};
    if(rel.endsWith('.json')){ try{ const j=JSON.parse(buf.toString('utf8')); meta={ keys:Object.keys(j).slice(0,20)} }catch{} }
    return { path:rel, sha256:hash, size:buf.length, meta, preview: buf.toString('utf8').slice(0,6000) };
  },
  'repo.tree': async (root, args)=>{
    const limit=Math.min(Number(args.limit||100),500);
    const out=git(root,['ls-files']).stdout.trim().split('\n').filter(Boolean).slice(0,limit);
    return { count:out.length, files:out };
  },
  'repo.search': async (root, args)=>{
    const q=String(args.query||args.pattern||'').trim(); if(!q) throw new Error('query required');
    const r=cp.spawnSync('git',['grep','-n',q],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
    return { hits: String(r.stdout||'').split('\n').filter(Boolean).slice(0,100) };
  },
  'repo.diff': async (root)=>{
    return { stat: git(root,['diff','--stat']).stdout.slice(0,6000), diff: git(root,['diff']).stdout.slice(0,8000) };
  },
  'repo.history': async (root, args)=>{
    const n=Math.min(Number(args.limit||10),30); return { logs: git(root,['log','--oneline',`-${n}`]).stdout.trim().split('\n') };
  },
  // reuse more from original by requiring it if needed
};

async function loadOriginalExecutors(){
  // try to reuse original worker's executors for git.apply_patch etc. by requiring it
  try{
    const orig = require('./browser-local-worker.cjs');
    // we will not import directly to avoid side effects, but we can manually handle key caps
    return orig;
  }catch{ return null; }
}

async function executeTask(task){
  // validate
  const v = validateTask(task);
  if(!v.ok) throw new Error(`validate failed: ${v.errors.join('; ')}`);
  if(!CAPS.capabilities[task.capability]) throw new Error(`capability not allowlisted: ${task.capability}`);
  if(task.risk==='high') throw new Error('high-risk blocked');
  const startedAt = nowIso();
  let output;
  const timeoutMs = (CAPS.capabilities[task.capability]?.timeoutMs)||120000;
  // choose executor
  if(task.capability==='repo.status'){
    output = await execRepoStatus(ROOT);
  } else if(EXECUTORS[task.capability]){
    output = await EXECUTORS[task.capability](ROOT, task.args||{});
  } else {
    // fallback to original worker's executeTask for complex caps (git.apply_patch, test.run, agent.dispatch)
    // load original executeTask dynamically
    const origWorker = require('./browser-local-worker.cjs');
    // origWorker.tick is not suitable, but we can call its internal executeTask if exported
    // instead, require and call executeTask exported from it (we export it now)
    if(typeof origWorker.executeTask === 'function'){
      // need to handle that original expects task with lease etc.
      // temporarily set env to avoid double heartbeat
      output = await origWorker.executeTask(task).then(r=>r.detail||r);
      // origWorker.executeTask returns buildResult, we need raw detail
      // if it returned buildResult, unwrap
      if(output && output.detail) output = output.detail;
      // if still buildResult shape, just return it as output
      // but we will build our own result below, so if orig already built result, just return that result directly
      if(output && output.task_id && output.status){
        return output; // already a result
      }
    } else {
      throw new Error(`no executor for ${task.capability}`);
    }
  }
  const finishedAt = nowIso();
  // build result
  const files_changed = output.filesChanged||output.files||[];
  const commit_sha = output.commitSha||output.sha||'';
  const git_diff_summary = output.diffSummary||output.stat||JSON.stringify(output).slice(0,2000);
  const tests = output.tests||[];
  const artifacts=[];
  let stdout_summary = output.stdout? String(output.stdout).slice(0,4000) : JSON.stringify(output,null,2).slice(0,4000);
  if(JSON.stringify(output).length>20000){
    ensureDir(path.join(ROOT,'state/browser-local-artifacts'));
    const artPath = path.join(ROOT,'state/browser-local-artifacts', `${task.task_id}.json`);
    fs.writeFileSync(artPath, JSON.stringify(output,null,2),'utf8');
    artifacts.push({ path: artPath, sha256: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex') });
  }
  const result = buildResult({ task_id: task.task_id, status:'completed', executor: WORKER_ID, started_at: task.started_at||startedAt, finished_at: finishedAt, files_changed, git_diff_summary, commit_sha, tests, artifacts, stdout_summary, stderr_summary:'', blockers:[], confidence:0.92 });
  result.detail = output;
  return result;
}

async function tick(){
  await heartbeat(null, { poll: true });
  const claimed = await claim();
  const task = claimed?.task || null;
  if(!task){
    log('no task (null) — polling');
    await heartbeat(null, { queue:'empty' });
    return { claimed:false };
  }
  log(`claimed ${task.task_id} ${task.capability} (attempt ${task.attempts})`);
  await heartbeat(task.task_id, { capability: task.capability, claimedAt: nowIso() });
  const start = Date.now();
  try{
    const result = await executeTask(task);
    // if executeTask already returned a buildResult (has status), use it directly
    const finalResult = (result && result.status && result.task_id) ? result : result;
    // ensure result is buildResult shape; if executeTask returned buildResult, finalResult is it
    let toComplete = finalResult;
    if(!toComplete.task_id) toComplete = finalResult; // fallback
    const r = await complete(task.task_id, toComplete.status||'completed', toComplete);
    const latency = Date.now()-start;
    log(`completed ${task.task_id} -> ${toComplete.status} latency ${latency}ms commit ${toComplete.commit_sha||''}`);
    await heartbeat(null, { lastTask: task.task_id, latency, lastCapability: task.capability });
    // also write local result for fallback
    const resPath = path.join(ROOT,'state/browser-local-results', `${task.task_id}.json`);
    ensureDir(path.dirname(resPath));
    fs.writeFileSync(resPath, JSON.stringify({ ...task, status: toComplete.status, finished_at: nowIso(), result: toComplete },null,2),'utf8');
    return { claimed:true, task_id: task.task_id, status: toComplete.status, latency, result: toComplete, task };
  }catch(e){
    log(`failed ${task.task_id}: ${e.message}`);
    const failResult = buildResult({ task_id: task.task_id, status:'failed', executor: WORKER_ID, started_at: task.started_at||nowIso(), finished_at: nowIso(), git_diff_summary:'', stdout_summary:'', stderr_summary:String(e.message).slice(0,4000), blockers:[String(e.message)], confidence:0.3 });
    try{ await complete(task.task_id, 'failed', failResult); }catch(err){ log('complete failed', err.message); }
    await heartbeat(null, { lastError:String(e.message).slice(0,400) });
    return { claimed:true, task_id: task.task_id, status:'failed', error:String(e.message) };
  }
}

async function loop(){
  const interval = Number(process.env.BROWSER_WORKER_POLL_MS||3000);
  log(`loop worker=${WORKER_ID} url=${SUPABASE_URL} poll=${interval}ms`);
  await heartbeat(null, { loopStart:true });
  while(true){
    try{ await tick(); }catch(e){ log('tick error', e.message); }
    await new Promise(r=>setTimeout(r, interval));
  }
}

async function main(){
  const cmd = String(process.argv[2]||'tick').toLowerCase();
  if(cmd==='tick'){ const r=await tick(); console.log(JSON.stringify(r,null,2)); process.exit(r.status==='failed'?1:0); }
  if(cmd==='loop'){ await loop(); }
  if(cmd==='heartbeat'){ const r=await heartbeat(null,{}); console.log(JSON.stringify(r,null,2)); }
  if(cmd==='health'){ const caps=Object.keys(CAPS.capabilities); console.log(JSON.stringify({ worker:WORKER_ID, version:CAPS.version, capabilities: caps, url: SUPABASE_URL, token: WORKER_TOKEN? 'set':'missing' },null,2)); }
}

if(require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
module.exports={ tick, heartbeat, claim, complete, executeTask };
