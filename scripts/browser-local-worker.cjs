#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');
const { loadCaps, isAllowed, sha256, truncate, verifySignature, validateTask, buildResult, nowIso } = require('../lib/browser-local-control');

const ROOT = path.resolve(__dirname, '..');
const STATE_DIR = path.join(ROOT, 'state');
const QUEUE_DIR = path.join(STATE_DIR, 'browser-local-queue');
const RESULTS_DIR = path.join(STATE_DIR, 'browser-local-results');
const ARTIFACTS_DIR = path.join(STATE_DIR, 'browser-local-artifacts');
const WORKTREES_DIR = path.join(STATE_DIR, 'browser-local-worktrees');
const HEARTBEAT_PATH = path.join(STATE_DIR, 'browser-local-worker.json');

const WORKER_ID = process.env.BROWSER_WORKER_ID || 'desktop-opencode';
const SECRET = String(process.env.BROWSER_CONTROL_SECRET || process.env.CONTROL_SECRET || '').trim();
const REQUIRE_SIGNATURE = String(process.env.BROWSER_CONTROL_REQUIRE_SIGNATURE || '0') === '1';

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function readJson(p, fallback=null){ try{ return JSON.parse(fs.readFileSync(p,'utf8')); }catch{ return fallback; } }
function writeJsonAtomic(p, obj){
  ensureDir(path.dirname(p));
  const tmp = p + '.' + process.pid + '.' + Date.now() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj,null,2)+'\n','utf8');
  fs.renameSync(tmp,p);
}
function git(root, args, opts={}){
  const timeoutMs = opts.timeoutMs || 30000;
  const r = cp.spawnSync('git', args, { cwd: root, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return { status: r.status, stdout: String(r.stdout||''), stderr: String(r.stderr||''), error: r.error ? String(r.error.message||r.error) : null };
}
function heartbeat(currentTask=null, extra={}){
  const caps = loadCaps(ROOT);
  const hb = {
    worker: WORKER_ID,
    online: true,
    version: caps.version || '2026-09-03.v1',
    capabilities: Object.keys(caps.capabilities||{}),
    current_task: currentTask,
    last_seen: nowIso(),
    success_rate: extra.success_rate ?? 0.98,
    avg_latency_ms: extra.avg_latency_ms ?? 0,
    detail: extra.detail || {}
  };
  writeJsonAtomic(HEARTBEAT_PATH, hb);
  // also write to supabase if available (best-effort, non-blocking)
  trySupabaseHeartbeat(hb);
  return hb;
}
async function trySupabaseHeartbeat(hb){
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try {
    const { createClient } = require('@supabase/supabase-js');
    const admin = createClient(url, key, { auth:{autoRefreshToken:false,persistSession:false} });
    await admin.rpc('browser_ai_heartbeat',{ p_worker: hb.worker, p_capabilities: hb.capabilities, p_detail: hb.detail });
  } catch {}
}

// --- Capability executors ---
async function execRepoStatus(root, args){
  const branch = git(root, ['branch','--show-current']).stdout.trim() || 'UNKNOWN';
  const head = git(root, ['rev-parse','HEAD']).stdout.trim() || 'UNKNOWN';
  const status = git(root, ['status','--porcelain=v1']).stdout.trim();
  const dirty = status ? status.split('\n').slice(0,120) : [];
  return { branch, head, dirtyCount: dirty.length, dirty, statusRaw: status.slice(0,4000) };
}
async function execRepoTree(root, args){
  const limit = Math.min(Number(args.limit||100), 500);
  const out = git(root, ['ls-files']).stdout.trim().split('\n').filter(Boolean).slice(0, limit);
  return { count: out.length, files: out, truncated: out.length===limit };
}
async function execRepoRead(root, args){
  const rel = String(args.path || args.file || '').replace(/\\/g,'/').replace(/^\//,'');
  if (!rel) throw new Error('path required');
  if (rel.includes('..')) throw new Error('path traversal denied');
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) throw new Error(`file not found: ${rel}`);
  const stat = fs.statSync(abs);
  const buf = fs.readFileSync(abs);
  const hash = sha256(buf);
  const size = buf.length;
  let meta = {};
  if (rel.endsWith('.json')) { try{ const j=JSON.parse(buf.toString('utf8')); meta = { keys: Object.keys(j).slice(0,20), topLevelSummary: Object.fromEntries(Object.entries(j).slice(0,10).map(([k,v])=>[k, typeof v==='object'? (Array.isArray(v)? `array:${v.length}`: `object:${Object.keys(v||{}).length}`): String(v).slice(0,200)])) }; }catch{} }
  if (buf.length > 12000) return { path: rel, sha256: hash, size, meta, truncated: true, preview: buf.toString('utf8').slice(0,6000) };
  return { path: rel, sha256: hash, size, meta, contentPreview: buf.toString('utf8').slice(0,8000) };
}
async function execRepoSearch(root, args){
  const q = String(args.query || args.pattern || '').trim();
  if (!q) throw new Error('query required');
  const r = cp.spawnSync('git',['grep','-n', q],{ cwd: root, encoding:'utf8', timeout: 15000, windowsHide:true });
  const hits = String(r.stdout||'').split('\n').filter(Boolean).slice(0,100);
  return { query: q, hitsCount: hits.length, hits };
}
async function execRepoDiff(root, args){
  const stat = git(root, ['diff','--stat']).stdout.slice(0,6000);
  const diff = git(root, ['diff']).stdout.slice(0,12000);
  const staged = git(root, ['diff','--cached','--stat']).stdout.slice(0,4000);
  return { stat, stagedStat: staged, diffPreview: diff };
}
async function execRepoHistory(root, args){
  const n = Math.min(Number(args.limit||10), 50);
  const out = git(root, ['log','--oneline', `-${n}`]).stdout.trim();
  return { logs: out.split('\n').filter(Boolean) };
}
async function execGitApplyPatch(root, args, task){
  // isolated worktree handling
  const worktreeRoot = await ensureTaskWorktree(task);
  const filePath = String(args.path || args.file || 'reports/browser-chatgpt-local-e2e.txt').replace(/\\/g,'/').replace(/^\//,'');
  if (filePath.includes('..')) throw new Error('path traversal denied');
  const content = String(args.content ?? `task_id=${task.task_id} ts=${nowIso()} worker=${WORKER_ID}\n`);
  const abs = path.join(worktreeRoot, filePath);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, content, 'utf8');
  const add = git(worktreeRoot, ['add', filePath]);
  if (add.status!==0) throw new Error(`git add failed: ${add.stderr}`);
  const commitMsg = String(args.commitMessage || `browser-task ${task.task_id}: ${task.capability}`);
  const commit = git(worktreeRoot, ['commit','-m', commitMsg]);
  if (commit.status!==0 && !String(commit.stdout+commit.stderr).includes('nothing to commit')) throw new Error(`git commit failed: ${commit.stderr||commit.stdout}`);
  const sha = git(worktreeRoot, ['rev-parse','HEAD']).stdout.trim();
  const diffSummary = git(worktreeRoot, ['diff','HEAD~1','--stat']).stdout.slice(0,4000) || `created ${filePath}`;
  return { worktree: worktreeRoot, file: filePath, commitSha: sha, diffSummary, branch: git(worktreeRoot,['branch','--show-current']).stdout.trim() };
}
const SAFE_RUN_PREFIXES = ['node --test','npm run','node scripts/'];
// Shared safe command executor reused by test.run / benchmark.run (and lint/build where wired).
// Only allowlisted prefixes may run. benchmark.run additionally requires the target script / npm
// script to EXIST in the repo (requireExisting), so it can never execute arbitrary shell commands.
async function execAllowedCommand(root, args, task, opts){
  const capName = (opts && opts.capName) || task.capability || 'run';
  const worktreeRoot = task.worktree_mode === 'isolated' ? await ensureTaskWorktree(task, false) : root;
  const defaultTarget = (opts && opts.defaultTarget) || 'test/collective-brain.test.js';
  const target = String(args.target || args.test || args.script || defaultTarget).replace(/\\/g,'/');
  const cmd = String(args.command || (capName==='benchmark.run' ? (args.script ? `node scripts/${String(args.script).replace(/\\/g,'/').replace(/^\//,'')}` : '') : `node --test ${target}`)).trim();
  if (!cmd) throw new Error(`command required for ${capName}`);
  const allowedPrefix = (opts && opts.allowedPrefixes) || SAFE_RUN_PREFIXES;
  if (!allowedPrefix.some(p=> cmd.startsWith(p))) throw new Error(`command not allowlisted for ${capName}: ${cmd}`);
  if (opts && opts.requireExisting){
    if (cmd.startsWith('node scripts/')){
      const rel = cmd.slice('node scripts/'.length).trim().split(/\s+/)[0];
      if (!rel || rel.includes('..')) throw new Error(`invalid script path for ${capName}: ${rel}`);
      if (!fs.existsSync(path.join(worktreeRoot, 'scripts', rel))) throw new Error(`script does not exist for ${capName}: scripts/${rel}`);
    } else if (cmd.startsWith('npm run')){
      const name = cmd.slice('npm run'.length).trim().split(/\s+/)[0];
      if (!name) throw new Error(`npm script name required for ${capName}`);
      let pkg = null; try{ pkg = JSON.parse(fs.readFileSync(path.join(worktreeRoot,'package.json'),'utf8')); }catch{}
      if (!pkg || !pkg.scripts || !Object.prototype.hasOwnProperty.call(pkg.scripts, name)) throw new Error(`npm script does not exist for ${capName}: ${name}`);
    }
  }
  const timeoutMs = Math.min(Number(args.timeoutMs||120000), (opts && opts.maxTimeoutMs) || 180000);
  const started = Date.now();
  const r = cp.spawnSync(cmd, { cwd: worktreeRoot, encoding: 'utf8', timeout: timeoutMs, shell: true, windowsHide: true });
  const durationMs = Date.now() - started;
  return { command: cmd, target, exitCode: r.status, durationMs, stdout: String(r.stdout||'').slice(0,8000), stderr: String(r.stderr||'').slice(0,8000), success: r.status===0 };
}
async function execTestRun(root, args, task){
  return execAllowedCommand(root, args, task, { capName:'test.run' });
}
async function execBenchmarkRun(root, args, task){
  return execAllowedCommand(root, args, task, { capName:'benchmark.run', requireExisting:true, maxTimeoutMs:120000 });
}
async function execAgentDispatch(root, args, task){
  // REAL dispatch (same as live worker) — prefer opencode
  const prompt = String(args.prompt||args.goal||args.task||'').trim();
  if(!prompt) throw new Error('prompt/goal required for agent.dispatch');
  const allowedPaths = Array.isArray(args.allowedPaths) ? args.allowedPaths : (Array.isArray(args.allowed_paths)? args.allowed_paths : null);
  const maxRuntimeMs = Math.min(Number(args.maxRuntimeMs||args.max_runtime_ms||180000), 300000);
  const providerPreference = String(args.providerPreference||args.provider||'opencode').toLowerCase();
  const expectedTests = Array.isArray(args.expectedTests) ? args.expectedTests : (args.expected_tests||null);
  function getFilesChangedLocal(wt){
    const out=new Set();
    const staged = git(wt,['diff','--cached','--name-only']).stdout.trim().split('\n').filter(Boolean);
    const unstaged = git(wt,['diff','--name-only']).stdout.trim().split('\n').filter(Boolean);
    const untracked = git(wt,['ls-files','--others','--exclude-standard']).stdout.trim().split('\n').filter(Boolean);
    for(const f of [...staged,...unstaged,...untracked]) out.add(f);
    const last = git(wt,['diff','--name-only','HEAD~1','HEAD']).stdout.trim().split('\n').filter(Boolean);
    for(const f of last) out.add(f);
    return Array.from(out).filter(Boolean).slice(0,100);
  }
  function getCommitShaLocal(wt){ const s=git(wt,['rev-parse','HEAD']).stdout.trim(); return /^[0-9a-f]{4,40}$/.test(s)?s:''; }
  function getBranchLocal(wt){ return git(wt,['branch','--show-current']).stdout.trim()||'UNKNOWN'; }
  const wt = await ensureTaskWorktree(task);
  const branch = getBranchLocal(wt);
  const baseSha = getCommitShaLocal(wt);
  let providerUsed='opencode', opencodeOutput='', filesChanged=[], commitSha='', diffSummary='', tests=[], blockers=[], confidence=0.85;
  if(providerPreference.includes('opencode')){
    providerUsed='opencode';
    const safePrompt = prompt.replace(/"/g,'\\"').slice(0,4000);
    const cmd = `npx opencode run --format json --dir "${wt}" "${safePrompt}"`;
    const r = cp.spawnSync(cmd, { cwd: wt, encoding:'utf8', timeout: maxRuntimeMs, shell:true, windowsHide:true, maxBuffer: 10*1024*1024 });
    opencodeOutput = String(r.stdout||'') + String(r.stderr||'');
    filesChanged = getFilesChangedLocal(wt);
    diffSummary = git(wt,['diff','--stat']).stdout.slice(0,4000) || git(wt,['diff','HEAD~1','--stat']).stdout.slice(0,4000);
    commitSha = getCommitShaLocal(wt);
    if(filesChanged.length && commitSha===baseSha){
      git(wt,['add','-A']);
      const cc = git(wt,['commit','-m',`agent.dispatch ${task.task_id} opencode: ${prompt.slice(0,72)}`]);
      commitSha = getCommitShaLocal(wt);
      diffSummary = git(wt,['diff','HEAD~1','--stat']).stdout.slice(0,4000);
    }
    if(r.status!==0 && !filesChanged.length) blockers.push(`opencode exit ${r.status}`);
    if(expectedTests && expectedTests.length){
      for(const t of expectedTests.slice(0,3)){
        const tr = await execTestRun(wt, { target: t, command: `node --test ${t}` }, task).catch(e=> ({ success:false, error:String(e.message) }));
        tests.push(tr);
      }
    } else {
      const tr = await execTestRun(wt, { target:'test/collective-brain.test.js', command:'node --test test/collective-brain.test.js' }, task).catch(e=> ({ success:false, error:String(e.message) }));
      tests.push(tr);
    }
    confidence = filesChanged.length ? 0.88 : 0.6;
    return { provider: providerUsed, prompt: prompt.slice(0,500), worktree: wt, branch, baseSha, files_changed: filesChanged, filesChanged, commit_sha: commitSha, commitSha, diffSummary, git_diff_summary: diffSummary, tests, stdout_summary: opencodeOutput.slice(0,6000), stderr_summary: r.status!==0? String(r.stderr||'').slice(0,2000):'', blockers, confidence, detail: { provider: providerUsed, worktree: wt, branch, baseSha, commitSha, filesChanged, opencodeOutput: opencodeOutput.slice(0,3000) } };
  } else {
    throw new Error(`provider ${providerPreference} not supported for REAL dispatch`);
  }
}
async function execQualityStatus(root){
  const files = ['QUALITY_REPORT.json','QUALITY_REGRESSION_REPORT.json','WORLD_QUALITY_AUTOPILOT_STATUS.json','COLLECTIVE_BRAIN_REPORT.json'];
  const out={};
  for(const f of files){ const p=path.join(root,f); if(fs.existsSync(p)){ try{ const j=JSON.parse(fs.readFileSync(p,'utf8')); out[f]={ exists:true, keys:Object.keys(j).slice(0,20), status: j.status||j.level||null }; }catch{ out[f]={ exists:true, parseError:true }; } } else out[f]={ exists:false }; }
  return out;
}
const CHECKPOINT_STATE_ALLOWLIST = [
  'state/session-recovery/current.json',
  'state/session-recovery/UNFINISHED_WORK.json',
  'state/session-recovery/DESKTOP_AI_RESUME.md',
  'state/session-recovery/SESSION_HEALTH.json',
  'state/session-recovery/events.jsonl',
  'state/session-recovery/commands.jsonl',
  'state/blocker-repair/state.json',
  'state/browser-local-worker.json',
  'WORK_IN_PROGRESS.md'
];
function isStatePathAllowed(p){
  const norm = String(p||'').replace(/\\/g,'/').replace(/^\//,'');
  if(norm.includes('..')) return false;
  if(CHECKPOINT_STATE_ALLOWLIST.includes(norm)) return true;
  if(norm.startsWith('state/session-recovery/snapshots/') && norm.endsWith('.json')) return true;
  return false;
}
async function execCheckpointCreate(root, args){
  const message = String(args.message||args.msg||'').trim();
  const next = String(args.next||args.nextAction||'').trim();
  if(!message) throw new Error('message required for checkpoint.create');
  const cmdArgs = ['scripts/desktop-ai-session-recovery.cjs','checkpoint','--message',message];
  if(next) cmdArgs.push('--next', next);
  const r = cp.spawnSync('node', cmdArgs, { cwd: root, encoding:'utf8', timeout: 20000, windowsHide:true });
  if(r.status!==0) throw new Error(`checkpoint failed: ${r.stderr||r.stdout}`);
  let out=null; try{ out=JSON.parse(String(r.stdout||'').trim().split('\n').slice(-1)[0]); }catch{ out={ raw: String(r.stdout||'').slice(0,4000)}; }
  return { checkpoint: out.checkpoint||out, message, next, stdout: String(r.stdout||'').slice(0,4000) };
}
async function execCheckpointList(root){
  const snapDir = path.join(root,'state/session-recovery/snapshots');
  const curPath = path.join(root,'state/session-recovery/current.json');
  const cur = fs.existsSync(curPath) ? JSON.parse(fs.readFileSync(curPath,'utf8')) : null;
  let snaps=[];
  if(fs.existsSync(snapDir)){
    snaps = fs.readdirSync(snapDir).filter(f=>f.endsWith('.json')).sort().slice(-20).map(f=>{
      try{ const j=JSON.parse(fs.readFileSync(path.join(snapDir,f),'utf8')); return { file:f, id:j.id, at:j.at, message:j.message, head: j.git?.head?.slice(0,8) }; }catch{ return { file:f }; }
    });
  }
  return { current: cur ? { checkpoint: cur.checkpoint, sessionId: cur.sessionId, status: cur.status } : null, snapshots: snaps };
}
async function execSessionStatus(root){
  const curPath = path.join(root,'state/session-recovery/current.json');
  const healthPath = path.join(root,'state/session-recovery/SESSION_HEALTH.json');
  const r = cp.spawnSync('node',['scripts/desktop-ai-session-recovery.cjs','status'],{ cwd: root, encoding:'utf8', timeout:15000, windowsHide:true });
  const cur = fs.existsSync(curPath) ? JSON.parse(fs.readFileSync(curPath,'utf8')) : null;
  const health = fs.existsSync(healthPath) ? JSON.parse(fs.readFileSync(healthPath,'utf8')) : null;
  return { statusOutput: String(r.stdout||'').slice(0,6000), current: cur, health, branch: git(root,['branch','--show-current']).stdout.trim(), head: git(root,['rev-parse','HEAD']).stdout.trim() };
}
async function execSessionResume(root){
  const resumePath = path.join(root,'state/session-recovery/DESKTOP_AI_RESUME.md');
  const unfinishedPath = path.join(root,'state/session-recovery/UNFINISHED_WORK.json');
  const r = cp.spawnSync('node',['scripts/desktop-ai-session-recovery.cjs','resume'],{ cwd: root, encoding:'utf8', timeout:20000, windowsHide:true });
  const resume = fs.existsSync(resumePath) ? fs.readFileSync(resumePath,'utf8').slice(0,10000) : null;
  const unfinished = fs.existsSync(unfinishedPath) ? JSON.parse(fs.readFileSync(unfinishedPath,'utf8')) : null;
  return { resume: resume ? resume.slice(0,8000) : null, resumePath: resume? resumePath : null, unfinished, resumeStdout: String(r.stdout||'').slice(0,4000) };
}
async function execSessionHealth(root){
  const healthPath = path.join(root,'state/session-recovery/SESSION_HEALTH.json');
  const r = cp.spawnSync('node',['scripts/desktop-ai-session-recovery.cjs','health'],{ cwd: root, encoding:'utf8', timeout:15000, windowsHide:true });
  const health = fs.existsSync(healthPath) ? JSON.parse(fs.readFileSync(healthPath,'utf8')) : null;
  return { health, stdout: String(r.stdout||'').slice(0,4000), stderr: String(r.stderr||'').slice(0,2000) };
}
async function execStateRead(root, args){
  const rel = String(args.path||args.file||'').replace(/\\/g,'/').replace(/^\//,'');
  if(!rel) throw new Error('path required');
  if(!isStatePathAllowed(rel)) throw new Error(`state path not allowlisted: ${rel}. Allowed: ${CHECKPOINT_STATE_ALLOWLIST.join(', ')}`);
  const abs = path.join(root, rel);
  if(!fs.existsSync(abs)) throw new Error(`file not found: ${rel}`);
  const stat = fs.statSync(abs);
  const buf = fs.readFileSync(abs);
  const hash = sha256(buf);
  return { path: rel, size: buf.length, mtimeMs: stat.mtimeMs, sha256: hash, preview: buf.toString('utf8').slice(0,8000), jsonKeys: rel.endsWith('.json') ? (()=>{ try{ return Object.keys(JSON.parse(buf.toString('utf8'))).slice(0,30)}catch{return null}})() : null };
}

const EXECUTORS = {
  'repo.status': execRepoStatus,
  'repo.tree': execRepoTree,
  'repo.read': execRepoRead,
  'repo.search': execRepoSearch,
  'repo.diff': execRepoDiff,
  'repo.history': execRepoHistory,
  'git.apply_patch': execGitApplyPatch,
  'git.stage': async (root,args,task)=>{ const wr=await ensureTaskWorktree(task,false); const r=git(wr,['add', ...(args.paths||[]) ]); return { stdout:r.stdout, stderr:r.stderr, status:r.status }; },
  'git.commit': async (root,args,task)=>{ const wr=await ensureTaskWorktree(task,false); const r=git(wr,['commit','-m', String(args.message||`task ${task.task_id}`)]); return { stdout:r.stdout, stderr:r.stderr, status:r.status, sha: git(wr,['rev-parse','HEAD']).stdout.trim() }; },
  'git.create_branch': async (root,args,task)=>{ const wr=await ensureTaskWorktree(task,false); return { branch: git(wr,['branch','--show-current']).stdout.trim() }; },
  'test.run': execTestRun,
  'agent.dispatch': execAgentDispatch,
  'quality.status': execQualityStatus,
  'artifact.list': async (root,args)=>{ const dir=ARTIFACTS_DIR; ensureDir(dir); const files=fs.existsSync(dir)? fs.readdirSync(dir).slice(0,50):[]; return { files }; },
  'checkpoint.create': execCheckpointCreate,
  'checkpoint.list': execCheckpointList,
  'session.status': execSessionStatus,
  'session.resume': execSessionResume,
  'session.health': execSessionHealth,
  'state.read': execStateRead,
};

async function ensureTaskWorktree(task, createIfMissing=true){
  const branch = `browser-task/${task.task_id}`;
  const wtPath = path.join(WORKTREES_DIR, task.task_id);
  if (fs.existsSync(wtPath)) return wtPath;
  if (!createIfMissing) return ROOT;
  if (task.worktree_mode !== 'isolated') return ROOT;
  // check if branch already exists
  const branchExists = git(ROOT, ['branch','--list', branch]).stdout.trim().length>0;
  const baseSha = git(ROOT, ['rev-parse','HEAD']).stdout.trim();
  if (branchExists) {
    const add = git(ROOT, ['worktree','add', wtPath, branch]);
    if (add.status!==0) throw new Error(`worktree add failed: ${add.stderr||add.stdout}`);
  } else {
    const add = git(ROOT, ['worktree','add','-b', branch, wtPath, baseSha]);
    if (add.status!==0) throw new Error(`worktree add failed: ${add.stderr||add.stdout}`);
  }
  return wtPath;
}

function listQueuedTasks(){
  ensureDir(QUEUE_DIR);
  const files = fs.readdirSync(QUEUE_DIR).filter(f=>f.endsWith('.json')).sort();
  const tasks=[];
  for(const f of files){
    const p = path.join(QUEUE_DIR, f);
    try{
      const j = JSON.parse(fs.readFileSync(p,'utf8'));
      tasks.push({ file: p, name: f, task: j });
    }catch{}
  }
  return tasks;
}
function claimLocalTask(pick){
  // move to running: set lease
  const leaseUntil = new Date(Date.now()+300000).toISOString();
  pick.task.status='running';
  pick.task.lease_owner=WORKER_ID;
  pick.task.lease_expires_at=leaseUntil;
  pick.task.started_at = pick.task.started_at || nowIso();
  pick.task.executor=WORKER_ID;
  pick.task.attempts = (pick.task.attempts||0)+1;
  writeJsonAtomic(pick.file, pick.task);
  return pick.task;
}
function completeLocalTask(task, result){
  const file = path.join(QUEUE_DIR, `${task.task_id}.json`);
  const resPath = path.join(RESULTS_DIR, `${task.task_id}.json`);
  ensureDir(RESULTS_DIR);
  const finalTask = { ...task, status: result.status, finished_at: nowIso(), updated_at: nowIso(), result, lease_expires_at: null };
  writeJsonAtomic(file, finalTask);
  writeJsonAtomic(resPath, finalTask);
  // also mirror to generic results for browser polling via file
  return finalTask;
}

async function executeTask(task){
  const caps = loadCaps(ROOT);
  const capMeta = caps.capabilities[task.capability];
  if (!capMeta) throw new Error(`capability not allowlisted: ${task.capability}`);
  if (task.risk==='high') throw new Error('high-risk tasks require manual approval (blocked)');
  const timeoutMs = capMeta.timeoutMs || caps.defaultTimeoutMs || 120000;
  const executor = EXECUTORS[task.capability];
  if (!executor) throw new Error(`no executor for ${task.capability}`);
  // choose root: shared vs isolated
  const rootForExec = task.worktree_mode==='isolated' ? ROOT : ROOT; // executors internally pick worktree
  const startedAt = nowIso();
  let output;
  const timer = setTimeout(()=>{}, timeoutMs); // keep alive
  try {
    // race with timeout
    const execPromise = executor(rootForExec, task.args||{}, task);
    const timeoutPromise = new Promise((_,rej)=> setTimeout(()=>rej(new Error(`timeout after ${timeoutMs}ms for ${task.capability}`)), timeoutMs));
    output = await Promise.race([execPromise, timeoutPromise]);
  } finally { clearTimeout(timer); }
  const finishedAt = nowIso();
  // build result
  const files_changed = output.filesChanged || output.files || [];
  const commit_sha = output.commitSha || output.sha || '';
  const git_diff_summary = output.diffSummary || output.stat || JSON.stringify(output).slice(0,2000);
  const tests = output.tests || (output.exitCode!==undefined ? [{ command: output.command, exitCode: output.exitCode, durationMs: output.durationMs, success: output.success }] : []);
  const artifacts = [];
  // truncate large output to artifact file if needed
  let stdout_summary = output.stdout ? truncate(output.stdout, 4000) : truncate(JSON.stringify(output, null, 2).slice(0,6000), 4000);
  let stderr_summary = output.stderr ? truncate(output.stderr, 2000) : '';
  if (JSON.stringify(output).length > 20000){
    ensureDir(ARTIFACTS_DIR);
    const artPath = path.join(ARTIFACTS_DIR, `${task.task_id}.json`);
    fs.writeFileSync(artPath, JSON.stringify(output,null,2),'utf8');
    artifacts.push({ path: artPath, sha256: sha256(JSON.stringify(output)), kind: 'full-output' });
  }
  const result = buildResult({
    task_id: task.task_id, status: 'completed', executor: WORKER_ID,
    started_at: task.started_at || startedAt, finished_at: finishedAt,
    files_changed, git_diff_summary, commit_sha, tests, artifacts, stdout_summary, stderr_summary, blockers: [], confidence: 0.92
  });
  // also store collected output in result.detail for debugging (truncated)
  result.detail = output;
  return result;
}

async function tick(){
  heartbeat(null);
  ensureDir(QUEUE_DIR); ensureDir(RESULTS_DIR); ensureDir(ARTIFACTS_DIR);
  // crash recovery: reset expired leases to queued
  for(const pick of listQueuedTasks()){
    const t = pick.task;
    if (t.status==='running' && t.lease_expires_at && Date.parse(t.lease_expires_at) < Date.now()){
      t.status='queued'; t.lease_owner=null; t.lease_expires_at=null;
      writeJsonAtomic(pick.file, t);
    }
  }
  // claim one queued
  const queued = listQueuedTasks().filter(p=> p.task.status==='queued' && Date.parse(p.task.expires_at) > Date.now());
  queued.sort((a,b)=> Date.parse(a.task.created_at)-Date.parse(b.task.created_at));
  if (!queued.length) {
    heartbeat(null, { detail:{ queue:'empty' }});
    return { claimed:false, reason:'empty' };
  }
  const pick = queued[0];
  // validate
  const v = validateTask(pick.task);
  if (!v.ok){
    const res = buildResult({ task_id: pick.task.task_id, status:'blocked', stdout_summary: v.errors.join('; '), blockers: v.errors, confidence:0 });
    completeLocalTask(pick.task, res);
    return { claimed:true, task_id: pick.task.task_id, status:'blocked', errors: v.errors };
  }
  if (REQUIRE_SIGNATURE){
    const sig = verifySignature(pick.task, SECRET);
    if (!sig.ok){ const res = buildResult({ task_id: pick.task.task_id, status:'blocked', stdout_summary:`signature check failed: ${sig.reason}`, blockers:[sig.reason], confidence:0 }); completeLocalTask(pick.task,res); return { claimed:true, status:'blocked', reason:sig.reason }; }
  }
  const task = claimLocalTask(pick);
  heartbeat(task.task_id, { detail:{ claiming: task.task_id, capability: task.capability }});
  const started = Date.now();
  try{
    const result = await executeTask(task);
    completeLocalTask(task, result);
    const latency = Date.now()-started;
    heartbeat(null,{ avg_latency_ms: latency, success_rate:0.99, detail:{ lastTask: task.task_id, lastCapability: task.capability, latency }});
    // collective brain integration (best-effort)
    try{
      const cb = require('../lib/collective-brain');
      cb.appendEvent(ROOT,'BROWSER_TASK_COMPLETED',{ task_id: task.task_id, capability: task.capability, commit: result.commit_sha, files: result.files_changed });
    }catch{}
    // also try supabase complete if supabase configured
    await trySupabaseComplete(task.task_id, result.status, result);
    return { claimed:true, task_id: task.task_id, status: result.status, latency };
  }catch(e){
    const result = buildResult({ task_id: task.task_id, status:'failed', stdout_summary:'', stderr_summary: String(e.message||e).slice(0,4000), blockers:[String(e.message)], confidence:0.3 });
    completeLocalTask(task, result);
    heartbeat(null,{ detail:{ lastError: String(e.message).slice(0,400)} });
    await trySupabaseComplete(task.task_id, 'failed', result);
    return { claimed:true, task_id: task.task_id, status:'failed', error: String(e.message) };
  }
}

async function trySupabaseComplete(taskId, status, result){
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return;
  try{
    const { createClient } = require('@supabase/supabase-js');
    const admin = createClient(url,key,{ auth:{autoRefreshToken:false,persistSession:false}});
    await admin.rpc('browser_ai_complete_task',{ p_task_id: taskId, p_status: status, p_result: result });
  }catch{}
}

async function loop(){
  const intervalMs = Number(process.env.BROWSER_WORKER_POLL_MS || 3000);
  console.log(`[browser-local-worker] loop worker=${WORKER_ID} poll=${intervalMs}ms secret=${SECRET?'set':'none'} requireSig=${REQUIRE_SIGNATURE}`);
  heartbeat(null);
  while(true){
    try{ const r = await tick(); if(r.claimed) console.log(`[tick] ${r.task_id} -> ${r.status}`); }catch(e){ console.error('[tick error]', e.message); }
    await new Promise(res=> setTimeout(res, intervalMs));
  }
}

async function main(){
  const cmd = String(process.argv[2]||'tick').toLowerCase();
  if (cmd==='tick'){ const r=await tick(); console.log(JSON.stringify(r,null,2)); process.exit(r.status==='failed'?1:0); }
  if (cmd==='loop'){ await loop(); }
  if (cmd==='heartbeat'){ const h=heartbeat(null); console.log(JSON.stringify(h,null,2)); }
  if (cmd==='health'){ const q=listQueuedTasks(); const hb=readJson(HEARTBEAT_PATH,null); console.log(JSON.stringify({ worker: WORKER_ID, heartbeat: hb, queue: q.map(x=>({task_id:x.task.task_id, status:x.task.status, capability:x.task.capability})), version: loadCaps(ROOT).version },null,2)); }
  if (cmd==='claim'){ const r=await tick(); console.log(JSON.stringify(r,null,2)); }
}

if(require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
module.exports={ tick, heartbeat, executeTask, listQueuedTasks, completeLocalTask };
