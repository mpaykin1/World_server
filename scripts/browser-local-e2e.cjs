#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { buildTask } = require('../lib/browser-local-control');
const ROOT = path.resolve(__dirname,'..');
const QUEUE_DIR = path.join(ROOT,'state/browser-local-queue');
const RESULTS_DIR = path.join(ROOT,'state/browser-local-results');
const REPORT_PATH = path.join(ROOT,'reports/browser-local-control-e2e.json');
const { spawnSync } = require('child_process');

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function enqueue(cap, args, opts){
  const t = buildTask({ capability: cap, args, ...opts });
  ensureDir(QUEUE_DIR);
  const fp = path.join(QUEUE_DIR, `${t.task_id}.json`);
  const secret = String(process.env.BROWSER_CONTROL_SECRET||'').trim();
  if (secret) { const { hmac } = require('../lib/browser-local-control'); t.signature = hmac(t.task_id, t.capability, t.args, secret); }
  fs.writeFileSync(fp, JSON.stringify(t,null,2),'utf8');
  return t;
}
function runTick(){
  const r = spawnSync('node',[path.join(__dirname,'browser-local-worker.cjs'),'tick'],{ cwd: ROOT, encoding:'utf8', timeout: 180000, windowsHide:true });
  return { status: r.status, stdout: String(r.stdout||''), stderr: String(r.stderr||''), error: r.error? String(r.error): null };
}
function getResult(taskId){
  const p = path.join(RESULTS_DIR, `${taskId}.json`);
  if(!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p,'utf8'));
}
async function waitResult(taskId, ms=15000){
  const start=Date.now();
  while(Date.now()-start < ms){
    const r = getResult(taskId);
    if(r && ['completed','failed','blocked','cancelled'].includes(r.status)) return r;
    // tick if not done
    runTick();
    await new Promise(res=>setTimeout(res, 800));
  }
  return getResult(taskId);
}

async function main(){
  console.log('[e2e] Browser Local Control — 5 E2Es');
  const e2e = { version:'2026-09-03.v1', startedAt: new Date().toISOString(), tasks:[], heartbeat:null, summary:{} };
  // clean previous state for deterministic run
  // ensure worker heartbeat baseline
  spawnSync('node',[path.join(__dirname,'browser-local-worker.cjs'),'heartbeat'],{ cwd: ROOT, encoding:'utf8', windowsHide:true });

  // 1. repo.status
  const t1 = enqueue('repo.status', {}, { idempotency_key: `e2e1-${Date.now()}` });
  console.log(`[e2e1] enqueue repo.status ${t1.task_id}`);
  const r1 = await waitResult(t1.task_id, 20000);
  e2e.tasks.push({ e2e:1, capability:'repo.status', task_id:t1.task_id, result: r1? r1.result : null, status: r1? r1.status : 'timeout', duration: r1? (Date.parse(r1.finished_at)-Date.parse(r1.started_at)): null });
  console.log(`[e2e1] status=${r1?r1.status:'timeout'} evidence branch=${r1?.result?.detail?.branch||'n/a'}`);

  // 2. repo.read package.json
  const t2 = enqueue('repo.read', { path:'package.json' }, { idempotency_key:`e2e2-${Date.now()}` });
  console.log(`[e2e2] enqueue repo.read package.json ${t2.task_id}`);
  const r2 = await waitResult(t2.task_id, 20000);
  e2e.tasks.push({ e2e:2, capability:'repo.read', task_id:t2.task_id, result: r2? r2.result : null, status: r2? r2.status : 'timeout' });
  const r2detail = r2?.result?.detail;
  console.log(`[e2e2] sha256=${r2detail?.sha256?.slice(0,12)} size=${r2detail?.size} keys=${r2detail?.meta?.keys?.slice(0,3)}`);

  // 3. git.apply_patch isolated write
  const t3 = enqueue('git.apply_patch', { path:'reports/browser-chatgpt-local-e2e.txt', content:`task_id=${Date.now()} e2e=3 worker=desktop-opencode ts=${new Date().toISOString()}\nBrowser ChatGPT -> Supabase -> Local Worker -> Isolated worktree commit PASS\n`, commitMessage:`browser-task e2e3: write reports/browser-chatgpt-local-e2e.txt` }, { idempotency_key:`e2e3-${Date.now()}` });
  console.log(`[e2e3] enqueue git.apply_patch ${t3.task_id}`);
  const r3 = await waitResult(t3.task_id, 25000);
  e2e.tasks.push({ e2e:3, capability:'git.apply_patch', task_id:t3.task_id, result: r3? r3.result : null, status: r3? r3.status : 'timeout' });
  console.log(`[e2e3] commit_sha=${r3?.result?.commit_sha?.slice(0,8)} worktree=${r3?.result?.detail?.worktree||'n/a'}`);

  // 4. test.run single safe test
  const t4 = enqueue('test.run', { target:'test/collective-brain.test.js', command:'node --test test/collective-brain.test.js' }, { idempotency_key:`e2e4-${Date.now()}` });
  console.log(`[e2e4] enqueue test.run ${t4.task_id}`);
  const r4 = await waitResult(t4.task_id, 60000);
  e2e.tasks.push({ e2e:4, capability:'test.run', task_id:t4.task_id, result: r4? r4.result : null, status: r4? r4.status : 'timeout' });
  console.log(`[e2e4] exitCode=${r4?.result?.detail?.exitCode ?? r4?.result?.tests?.[0]?.exitCode} success=${r4?.result?.detail?.success}`);

  // 5. agent.dispatch OpenCode
  const t5 = enqueue('agent.dispatch', { applyFix:true }, { idempotency_key:`e2e5-${Date.now()}` });
  console.log(`[e2e5] enqueue agent.dispatch ${t5.task_id}`);
  const r5 = await waitResult(t5.task_id, 40000);
  e2e.tasks.push({ e2e:5, capability:'agent.dispatch', task_id:t5.task_id, result: r5? r5.result : null, status: r5? r5.status : 'timeout' });
  console.log(`[e2e5] status=${r5?.status} commit=${r5?.result?.commit_sha?.slice(0,8)} files=${(r5?.result?.files_changed||[]).length}`);

  // heartbeat
  const hbPath = path.join(ROOT,'state/browser-local-worker.json');
  e2e.heartbeat = fs.existsSync(hbPath)? JSON.parse(fs.readFileSync(hbPath,'utf8')): null;
  e2e.finishedAt = new Date().toISOString();
  const passed = e2e.tasks.filter(t=> t.status==='completed').length;
  e2e.summary = { total:5, passed, failed: 5-passed, allCompleted: passed===5 };
  ensureDir(path.dirname(REPORT_PATH));
  fs.writeFileSync(REPORT_PATH, JSON.stringify(e2e,null,2),'utf8');
  console.log(`\n[e2e] summary ${passed}/5 passed -> ${REPORT_PATH}`);
  console.log(JSON.stringify(e2e.summary,null,2));
  // also write authority contribution stub (filled later)
  process.exit(passed===5?0:1);
}
if(require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
