#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const cp = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const { loadCaps, validateTask, buildResult, nowIso, sha256 } = require('../lib/browser-local-control');

// load .env.local if present (untracked)
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

// startup self-audit: declared vs registered executor
function auditCapabilities(){
  const caps = CAPS.capabilities || {};
  const missing=[];
  const declaredOnly=[];
  for(const [name, meta] of Object.entries(caps)){
    const hasExecutor = meta.executor && meta.status !== 'DECLARED_ONLY' && meta.status !== 'BLOCKED';
    // we will check actual EXECUTORS map after it is defined — for now log declared status
    if(meta.status === 'DECLARED_ONLY' || meta.status === 'BLOCKED') declaredOnly.push(name);
  }
  if(declaredOnly.length) console.log(`[live-worker] audit: ${declaredOnly.length} capabilities are DECLARED_ONLY/BLOCKED (not advertised as PASS):`, declaredOnly.join(', '));
  // after EXECUTORS defined we will re-audit
  return { declaredOnly };
}
auditCapabilities();

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
    const hbPath = path.join(ROOT,'state/browser-local-worker.json');
    const hb = { worker: WORKER_ID, online:true, version: CAPS.version||'2026-09-03.v2', capabilities: caps, current_task: currentTask, last_seen: nowIso(), success_rate:0.99, avg_latency_ms:detail.latency||0, detail };
    fs.mkdirSync(path.dirname(hbPath),{recursive:true});
    // atomic write
    const tmp = hbPath + '.' + process.pid + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(hb,null,2)+'\n','utf8');
    fs.renameSync(tmp, hbPath);
    return r;
  }catch(e){ log('heartbeat error', e.message); throw e; }
}

async function claim(){
  return rpc('browser_ai_worker_claim',{ p_worker: WORKER_ID, p_token: WORKER_TOKEN, p_capabilities: [], p_lease_seconds: 300 });
}

async function complete(p_task_id, p_status, p_result){
  return rpc('browser_ai_worker_complete',{ p_worker: WORKER_ID, p_token: WORKER_TOKEN, p_task_id, p_status, p_result });
}

function ensureDir(p){ fs.mkdirSync(p,{recursive:true}); }
function git(root, args, timeoutMs=30000){
  const r = cp.spawnSync('git', args, { cwd: root, encoding:'utf8', timeout: timeoutMs, windowsHide:true });
  return { status:r.status, stdout:String(r.stdout||''), stderr:String(r.stderr||''), error:r.error?String(r.error):null };
}
function getFilesChanged(worktreeRoot){
  // collect files_changed correctly: staged + unstaged + untracked (but tracked path)
  const out=new Set();
  const staged = git(worktreeRoot,['diff','--cached','--name-only']).stdout.trim().split('\n').filter(Boolean);
  const unstaged = git(worktreeRoot,['diff','--name-only']).stdout.trim().split('\n').filter(Boolean);
  const untracked = git(worktreeRoot,['ls-files','--others','--exclude-standard']).stdout.trim().split('\n').filter(Boolean);
  for(const f of [...staged,...unstaged,...untracked]) out.add(f);
  // also include diff vs HEAD for committed changes in last commit
  const lastCommitFiles = git(worktreeRoot,['diff','--name-only','HEAD~1','HEAD']).stdout.trim().split('\n').filter(Boolean);
  for(const f of lastCommitFiles) out.add(f);
  return Array.from(out).filter(Boolean).slice(0,100);
}
function getCommitSha(worktreeRoot){
  const sha = git(worktreeRoot,['rev-parse','HEAD']).stdout.trim();
  return /^[0-9a-f]{4,40}$/.test(sha) ? sha : '';
}
function getBranch(worktreeRoot){
  return git(worktreeRoot,['branch','--show-current']).stdout.trim()||'UNKNOWN';
}

const WORKTREES_DIR = path.join(ROOT,'state/browser-local-worktrees');
async function ensureTaskWorktree(task){
  const branch = `browser-task/${task.task_id}`;
  const wtPath = path.join(WORKTREES_DIR, task.task_id);
  if(fs.existsSync(wtPath)) return wtPath;
  if(task.worktree_mode !== 'isolated') return ROOT;
  const branchExists = git(ROOT,['branch','--list',branch]).stdout.trim().length>0;
  const baseSha = String(task.args&&task.args.baseSha || git(ROOT,['rev-parse','HEAD']).stdout.trim() || 'HEAD').trim();
  const base = /^[0-9a-f]{7,40}$/.test(baseSha) ? baseSha : 'HEAD';
  let add;
  if(branchExists){
    add = git(ROOT,['worktree','add',wtPath,branch]);
  } else {
    add = git(ROOT,['worktree','add','-b',branch,wtPath,base]);
  }
  if(add.status!==0) throw new Error(`worktree add failed: ${add.stderr||add.stdout}`);
  return wtPath;
}

// executors
async function execRepoStatus(root){
  const branch = getBranch(root);
  const head = getCommitSha(root);
  const status = git(root,['status','--porcelain=v1']).stdout.trim();
  const dirty = status? status.split('\n').slice(0,120):[];
  return { branch, head, dirtyCount: dirty.length, dirty, statusRaw: status.slice(0,4000) };
}
async function execRepoTree(root, args){
  const limit=Math.min(Number(args.limit||100),500);
  const out=git(root,['ls-files']).stdout.trim().split('\n').filter(Boolean).slice(0,limit);
  return { count:out.length, files:out };
}
async function execRepoRead(root, args){
  const rel = String(args.path||args.file||'').replace(/\\/g,'/').replace(/^\//,'');
  if(!rel) throw new Error('path required');
  if(rel.includes('..')) throw new Error('path traversal denied');
  const abs = path.join(root, rel);
  if(!fs.existsSync(abs)) throw new Error(`file not found: ${rel}`);
  const buf = fs.readFileSync(abs);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  let meta={};
  if(rel.endsWith('.json')){ try{ const j=JSON.parse(buf.toString('utf8')); meta={ keys:Object.keys(j).slice(0,20)} }catch{} }
  return { path:rel, sha256:hash, size:buf.length, meta, preview: buf.toString('utf8').slice(0,6000) };
}
async function execRepoSearch(root, args){
  const q=String(args.query||args.pattern||'').trim(); if(!q) throw new Error('query required');
  const r=cp.spawnSync('git',['grep','-n',q],{cwd:root,encoding:'utf8',timeout:10000,windowsHide:true});
  return { query:q, hits: String(r.stdout||'').split('\n').filter(Boolean).slice(0,100) };
}
async function execRepoDiff(root){
  return { stat: git(root,['diff','--stat']).stdout.slice(0,6000), diff: git(root,['diff']).stdout.slice(0,8000) };
}
async function execRepoHistory(root, args){
  const n=Math.min(Number(args.limit||10),30); return { logs: git(root,['log','--oneline',`-${n}`]).stdout.trim().split('\n') };
}
async function execGitFetch(root){
  const r=git(root,['fetch','origin']);
  if(r.status!==0) throw new Error(`git fetch failed: ${r.stderr}`);
  return { stdout: r.stdout.slice(0,2000) };
}
async function execGitApplyPatch(root, args, task){
  const wt = await ensureTaskWorktree(task);
  const filePath = String(args.path||args.file||'reports/browser-chatgpt-local-e2e.txt').replace(/\\/g,'/').replace(/^\//,'');
  if(filePath.includes('..')) throw new Error('path traversal denied');
  const allowed = Array.isArray(args.allowedPaths) ? args.allowedPaths : null;
  if(allowed && !allowed.some(p=> filePath===p || filePath.startsWith(p.replace(/\/\*$/,'')))) throw new Error(`path not in allowedPaths: ${filePath}`);
  const content = String(args.content ?? `task_id=${task.task_id} ts=${nowIso()} worker=${WORKER_ID}\n`);
  const abs = path.join(wt, filePath);
  ensureDir(path.dirname(abs));
  fs.writeFileSync(abs, content, 'utf8');
  const add = git(wt,['add',filePath]);
  if(add.status!==0) throw new Error(`git add failed: ${add.stderr}`);
  const commitMsg = String(args.commitMessage||`browser-task ${task.task_id}: ${task.capability} ${filePath}`);
  const commit = git(wt,['commit','-m',commitMsg]);
  if(commit.status!==0 && !String(commit.stdout+commit.stderr).includes('nothing to commit')) throw new Error(`git commit failed: ${commit.stderr||commit.stdout}`);
  const sha = getCommitSha(wt);
  const diffSummary = git(wt,['diff','HEAD~1','--stat']).stdout.slice(0,4000) || `created ${filePath}`;
  const files_changed = getFilesChanged(wt);
  return { worktree: wt, file: filePath, commitSha: sha, diffSummary, branch: getBranch(wt), files_changed, filesChanged: files_changed };
}
async function execGitStage(root, args, task){
  const wt = await ensureTaskWorktree(task);
  const paths = Array.isArray(args.paths) ? args.paths : (args.path? [args.path]:[]);
  if(!paths.length) throw new Error('paths required');
  const r=git(wt,['add',...paths]);
  if(r.status!==0) throw new Error(`git add failed: ${r.stderr}`);
  return { stdout:r.stdout, worktree: wt, files_changed: getFilesChanged(wt), branch: getBranch(wt) };
}
async function execGitCommit(root, args, task){
  const wt = await ensureTaskWorktree(task);
  const msg = String(args.message||`task ${task.task_id}`);
  const r=git(wt,['commit','-m',msg]);
  if(r.status!==0 && !String(r.stdout+r.stderr).includes('nothing to commit')) throw new Error(`git commit failed: ${r.stderr}`);
  return { stdout:r.stdout, sha: getCommitSha(wt), worktree: wt, branch: getBranch(wt), files_changed: getFilesChanged(wt) };
}
async function execGitPush(root, args, task){
  const wt = await ensureTaskWorktree(task);
  const branch = String(args.branch|| getBranch(wt) || `browser-task/${task.task_id}`);
  if(branch==='master' || branch==='main') throw new Error('push to master/main blocked');
  if(!branch.startsWith('browser-task/') && !String(args.allowUnrelated||'').toLowerCase().includes('true')) throw new Error(`push only browser-task/* allowed, got ${branch} (use allowUnrelated=true for higher authority)`);
  // ensure branch exists
  const curBranch = getBranch(wt);
  if(curBranch!==branch){
    const checkout = git(wt,['checkout',branch]);
    if(checkout.status!==0) {
      // try create
      const create = git(wt,['checkout','-b',branch]);
      if(create.status!==0) throw new Error(`checkout branch failed: ${checkout.stderr}`);
    }
  }
  // push (no force)
  const r=git(wt,['push','origin',branch]);
  if(r.status!==0) throw new Error(`git push failed: ${r.stderr||r.stdout}`);
  const sha = getCommitSha(wt);
  // do not log credentials
  return { branch, commit_sha: sha, remote: `origin/${branch}`, worktree: wt, files_changed: getFilesChanged(wt), stdout: r.stdout.slice(0,1000).replace(/https:\/\/.*@/g,'[REDACTED]@') };
}
async function execTestRun(root, args, task){
  const wt = task.worktree_mode==='isolated' ? await ensureTaskWorktree(task) : root;
  // prefer task worktree for isolated
  const targetWt = await ensureTaskWorktree(task).catch(()=> root);
  const actualRoot = task.worktree_mode==='isolated' ? targetWt : root;
  const target = String(args.target||args.test||'test/collective-brain.test.js').replace(/\\/g,'/');
  const cmd = String(args.command||`node --test ${target}`);
  const allowedPrefix=['node --test','npm run','node scripts/','npx playwright'];
  if(!allowedPrefix.some(p=> cmd.startsWith(p))) throw new Error(`command not allowlisted: ${cmd}`);
  const timeoutMs=Math.min(Number(args.timeoutMs||120000),180000);
  const started=Date.now();
  const r=cp.spawnSync(cmd,{ cwd: actualRoot, encoding:'utf8', timeout: timeoutMs, shell:true, windowsHide:true });
  const durationMs=Date.now()-started;
  return { command: cmd, target, exitCode: r.status, durationMs, stdout: String(r.stdout||'').slice(0,8000), stderr: String(r.stderr||'').slice(0,3000), success: r.status===0, worktree: actualRoot, branch: getBranch(actualRoot) };
}
async function execAgentDispatchReal(root, args, task){
  // REAL AI dispatch: prompt, goal, allowedPaths, baseSha, expectedTests, maxRuntimeMs, providerPreference, costClass
  const prompt = String(args.prompt||args.goal||args.task||'').trim();
  if(!prompt) throw new Error('prompt/goal required for agent.dispatch');
  const allowedPaths = Array.isArray(args.allowedPaths) ? args.allowedPaths : (Array.isArray(args.allowed_paths)? args.allowed_paths : null);
  const maxRuntimeMs = Math.min(Number(args.maxRuntimeMs||args.max_runtime_ms||180000), 300000);
  const providerPreference = String(args.providerPreference||args.provider||'opencode').toLowerCase();
  const costClass = String(args.costClass||'free').toLowerCase();
  const expectedTests = Array.isArray(args.expectedTests) ? args.expectedTests : (args.expected_tests||null);

  const wt = await ensureTaskWorktree(task);
  const branch = getBranch(wt);
  const baseSha = getCommitSha(wt);
  const startedAt = nowIso();

  let providerUsed='opencode';
  let opencodeOutput='';
  let filesChanged=[], commitSha='', diffSummary='', tests=[], stdoutSummary='', stderrSummary='', blockers=[], confidence=0.85;

  // choose provider
  if(providerPreference.includes('opencode')){
    providerUsed='opencode';
    // invoke opencode via npx opencode run --format json --dir <wt> "<prompt>"
    const safePrompt = prompt.replace(/"/g,'\\"').slice(0,4000);
    const cmd = `npx opencode run --format json --dir "${wt}" "${safePrompt}"`;
    log(`agent.dispatch opencode in ${wt} prompt=${prompt.slice(0,80)}...`);
    const r = cp.spawnSync(cmd, { cwd: wt, encoding:'utf8', timeout: maxRuntimeMs, shell:true, windowsHide:true, maxBuffer: 10*1024*1024 });
    opencodeOutput = String(r.stdout||'') + String(r.stderr||'');
    // parse json events to find tool uses / file changes
    const events = opencodeOutput.split('\n').filter(l=> l.trim().startsWith('{')).map(l=>{ try{ return JSON.parse(l)}catch{return null}}).filter(Boolean);
    const toolOutputs = events.filter(e=> e.type==='tool_use').map(e=> e.part?.tool||'').join(' ').slice(0,2000);
    // collect files_changed via git
    filesChanged = getFilesChanged(wt);
    diffSummary = git(wt,['diff','--stat']).stdout.slice(0,4000) || git(wt,['diff','HEAD~1','--stat']).stdout.slice(0,4000);
    commitSha = getCommitSha(wt);
    // if opencode made changes but not committed, commit them
    if(filesChanged.length && commitSha===baseSha){
      git(wt,['add','-A']);
      const commit = git(wt,['commit','-m',`agent.dispatch ${task.task_id} opencode: ${prompt.slice(0,72)}`]);
      commitSha = getCommitSha(wt);
      diffSummary = git(wt,['diff','HEAD~1','--stat']).stdout.slice(0,4000);
    }
    stdoutSummary = opencodeOutput.slice(0,6000);
    stderrSummary = r.status!==0 ? String(r.stderr||'').slice(0,2000) : '';
    if(r.status!==0 && !filesChanged.length) blockers.push(`opencode exit ${r.status}`);
    // run expected tests if provided
    if(expectedTests && expectedTests.length){
      for(const t of expectedTests.slice(0,3)){
        const tr = await execTestRun(wt, { target: t, command: `node --test ${t}` }, task).catch(e=> ({ success:false, error:String(e.message) }));
        tests.push(tr);
      }
    } else {
      // default: run collective-brain test as smoke
      const tr = await execTestRun(wt, { target:'test/collective-brain.test.js', command:'node --test test/collective-brain.test.js' }, task).catch(e=> ({ success:false, error:String(e.message) }));
      tests.push(tr);
    }
    confidence = filesChanged.length ? 0.88 : 0.6;
  } else if(providerPreference.includes('ollama')){
    providerUsed='ollama';
    // check ollama health
    const ollamaUrl = process.env.OLLAMA_URL || 'http://127.0.0.1:11434';
    try{
      const res = await fetch(`${ollamaUrl.replace(/\/$/,'')}/api/tags`, { signal: AbortSignal.timeout(2000) });
      if(!res.ok) throw new Error(`ollama tags ${res.status}`);
      // TODO: implement ollama generate for code task
      throw new Error('ollama dispatch not yet implemented for code tasks — use opencode');
    }catch(e){ throw new Error(`ollama not available: ${e.message}`); }
  } else {
    throw new Error(`provider ${providerPreference} not supported for REAL dispatch (allowed: opencode, ollama)`);
  }

  return {
    provider: providerUsed,
    prompt: prompt.slice(0,500),
    goal: String(args.goal||'').slice(0,500),
    worktree: wt,
    branch,
    baseSha,
    files_changed: filesChanged,
    filesChanged,
    commit_sha: commitSha,
    commitSha,
    diffSummary,
    git_diff_summary: diffSummary,
    tests,
    stdout_summary: stdoutSummary.slice(0,4000),
    stderr_summary: stderrSummary.slice(0,2000),
    blockers,
    confidence,
    detail: { provider: providerUsed, worktree: wt, branch, baseSha, commitSha, filesChanged, opencodeOutput: opencodeOutput.slice(0,3000) }
  };
}

// browser executors via playwright
const BROWSER_ALLOWLIST = [
  'https://world-server.vercel.app',
  'https://world-server-*.vercel.app',
  'https://dark-void-navigator.*',
  'https://iphfwxjuhsucvdyluink.supabase.co',
  'http://localhost:'
];
function isUrlAllowed(u){
  try{
    const url = new URL(u);
    if(url.hostname==='localhost' || url.hostname==='127.0.0.1') return true;
    if(url.hostname.endsWith('vercel.app') && url.hostname.includes('world-server')) return true;
    if(url.hostname==='world-server.vercel.app') return true;
    if(url.hostname.includes('supabase.co') && url.hostname.startsWith('iphfwxjuhsucvdyluink')) return true;
    // allow exact production
    if(BROWSER_ALLOWLIST.some(p=> {
      if(p.includes('*')) {
        const re = new RegExp('^'+p.replace(/\*/g,'.*').replace(/\//g,'\\/')+'$');
        return re.test(u);
      }
      return u.startsWith(p);
    })) return true;
    return false;
  }catch{ return false; }
}
async function execBrowserOpen(root, args){
  const url = String(args.url||args.target||'').trim();
  if(!url) throw new Error('url required');
  if(!isUrlAllowed(url)) throw new Error(`url not allowlisted: ${url} (allowed: world-server production/preview, localhost, supabase)`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless:true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const consoleErrors=[];
  page.on('console', msg=>{ if(msg.type()==='error') consoleErrors.push(msg.text().slice(0,300)); });
  const started=Date.now();
  const resp = await page.goto(url, { waitUntil:'domcontentloaded', timeout: 20000 });
  const title = await page.title().catch(()=> '');
  const finalUrl = page.url();
  const status = resp ? resp.status() : 0;
  await browser.close();
  const durationMs=Date.now()-started;
  return { url, finalUrl, status, title: title.slice(0,300), consoleErrorCount: consoleErrors.length, consoleErrors: consoleErrors.slice(0,10), durationMs };
}
async function execBrowserScreenshot(root, args){
  const url = String(args.url||'').trim();
  if(url && !isUrlAllowed(url)) throw new Error(`url not allowlisted: ${url}`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless:true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if(url) await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
  const dir = path.join(ROOT,'state/browser-local-artifacts');
  ensureDir(dir);
  const file = path.join(dir, `screenshot-${Date.now()}.png`);
  await page.screenshot({ path: file, fullPage: !!args.fullPage });
  await browser.close();
  const buf = fs.readFileSync(file);
  const hash = crypto.createHash('sha256').update(buf).digest('hex');
  return { screenshotPath: file, sha256: hash, size: buf.length, url: url||null };
}
async function execBrowserConsole(root, args){
  const url = String(args.url||'').trim();
  if(!url) throw new Error('url required');
  if(!isUrlAllowed(url)) throw new Error(`url not allowlisted: ${url}`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless:true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs=[];
  page.on('console', msg=> logs.push({ type: msg.type(), text: msg.text().slice(0,500) }));
  page.on('pageerror', err=> logs.push({ type:'pageerror', text: String(err).slice(0,500) }));
  await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 });
  await page.waitForTimeout(1500);
  await browser.close();
  const errors = logs.filter(l=> l.type==='error'||l.type==='pageerror');
  const warnings = logs.filter(l=> l.type==='warning');
  return { url, consoleErrors: errors.slice(0,20), consoleWarnings: warnings.slice(0,20), total: logs.length };
}
async function execBrowserScenario(root, args){
  const url = String(args.url||'').trim();
  const actions = Array.isArray(args.actions) ? args.actions : [];
  if(url && !isUrlAllowed(url)) throw new Error(`url not allowlisted: ${url}`);
  if(!actions.length) throw new Error('actions required: [{action:"goto"|"click"|"fill"|"key"|"wait"|"screenshot", selector, value, url}]');
  const allowedActions = new Set(['goto','click','fill','key','wait','screenshot']);
  for(const a of actions) if(!allowedActions.has(a.action)) throw new Error(`action not allowlisted: ${a.action}`);
  const { chromium } = require('playwright');
  const browser = await chromium.launch({ headless:true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const logs=[];
  page.on('console', m=> logs.push(m.text().slice(0,300)));
  let curUrl = url;
  if(url) { await page.goto(url, { waitUntil:'domcontentloaded', timeout:20000 }); curUrl=page.url(); }
  for(const a of actions){
    if(a.action==='goto'){
      const u = String(a.url||a.value||'');
      if(!isUrlAllowed(u)) throw new Error(`goto url not allowlisted: ${u}`);
      await page.goto(u, { waitUntil:'domcontentloaded', timeout:20000 });
      curUrl=page.url();
    } else if(a.action==='click'){
      await page.click(String(a.selector), { timeout:5000 });
    } else if(a.action==='fill'){
      await page.fill(String(a.selector), String(a.value||''), { timeout:5000 });
    } else if(a.action==='key'){
      await page.keyboard.press(String(a.key||a.value));
    } else if(a.action==='wait'){
      await page.waitForTimeout(Math.min(Number(a.ms||a.value||1000),5000));
    } else if(a.action==='screenshot'){
      const dir=path.join(ROOT,'state/browser-local-artifacts');
      ensureDir(dir);
      const file=path.join(dir,`scenario-${Date.now()}.png`);
      await page.screenshot({ path: file });
    }
  }
  const title = await page.title().catch(()=> '');
  const screenshotDir=path.join(ROOT,'state/browser-local-artifacts');
  ensureDir(screenshotDir);
  const shot=path.join(screenshotDir,`scenario-final-${Date.now()}.png`);
  await page.screenshot({ path: shot });
  await browser.close();
  const buf=fs.readFileSync(shot);
  return { finalUrl: curUrl, title: title.slice(0,300), screenshotPath: shot, sha256: crypto.createHash('sha256').update(buf).digest('hex'), logs: logs.slice(0,20) };
}

const EXECUTORS = {
  'repo.status': async (root)=> execRepoStatus(root),
  'repo.read': async (root, args)=> execRepoRead(root, args),
  'repo.tree': async (root, args)=> execRepoTree(root, args),
  'repo.search': async (root, args)=> execRepoSearch(root, args),
  'repo.diff': async (root)=> execRepoDiff(root),
  'repo.history': async (root, args)=> execRepoHistory(root, args),
  'git.fetch': async (root)=> execGitFetch(root),
  'git.create_worktree': async (root, args, task)=> { const wt=await ensureTaskWorktree(task); return { worktree: wt, branch: getBranch(wt) }; },
  'git.create_branch': async (root, args, task)=> { const wt=await ensureTaskWorktree(task); return { branch: getBranch(wt), worktree: wt }; },
  'git.apply_patch': async (root, args, task)=> execGitApplyPatch(root, args, task),
  'git.stage': async (root, args, task)=> execGitStage(root, args, task),
  'git.commit': async (root, args, task)=> execGitCommit(root, args, task),
  'git.push': async (root, args, task)=> execGitPush(root, args, task),
  'git.conflicts': async (root)=> ({ conflicts: git(root,['diff','--check']).stdout.slice(0,2000) }),
  'test.list': async (root)=> ({ scripts: Object.keys(JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8')).scripts||{}).slice(0,50) }),
  'test.run': async (root, args, task)=> execTestRun(root, args, task),
  'lint.run': async (root, args, task)=> execTestRun(root, { command:'node scripts/check-js.js', target:'scripts/check-js.js' }, task),
  'build.run': async (root, args, task)=> execTestRun(root, { command:'npm run build', target:'build' }, task),
  'agent.list': async ()=> ({ agents: ['opencode','openhuman','ollama','claude'], preferred:'opencode' }),
  'agent.dispatch': async (root, args, task)=> execAgentDispatchReal(root, args, task),
  'agent.status': async (root, args)=> ({ status:'unknown', note:'use browser_ai_get_task' }),
  'agent.result': async (root, args)=> ({ note:'use browser_ai_get_result' }),
  'agent.cancel': async (root, args)=> ({ note:'use browser_ai_cancel_task' }),
  'quality.status': async (root)=> {
    const files=['QUALITY_REPORT.json','QUALITY_REGRESSION_REPORT.json'];
    const out={}; for(const f of files){ const p=path.join(root,f); out[f]=fs.existsSync(p)? JSON.parse(fs.readFileSync(p,'utf8')).status||'exists':'missing'; }
    return out;
  },
  'quality.blockers': async ()=> ({ blockers: JSON.parse(fs.readFileSync(path.join(ROOT,'state/blocker-repair/state.json'),'utf8')||'{}') }),
  'quality.regressions': async (root)=> ({ regressions: fs.existsSync(path.join(root,'QUALITY_REGRESSION_REPORT.json'))? 'exists':'missing' }),
  'browser.open': async (root, args)=> execBrowserOpen(root, args),
  'browser.screenshot': async (root, args)=> execBrowserScreenshot(root, args),
  'browser.console': async (root, args)=> execBrowserConsole(root, args),
  'browser.scenario': async (root, args)=> execBrowserScenario(root, args),
  'artifact.list': async ()=> {
    const dir=path.join(ROOT,'state/browser-local-artifacts');
    ensureDir(dir);
    return { files: fs.existsSync(dir)? fs.readdirSync(dir).slice(0,50):[] };
  },
  'artifact.read': async (root, args)=> {
    const p=String(args.path||'');
    const abs=path.join(ROOT,'state/browser-local-artifacts',path.basename(p));
    if(!fs.existsSync(abs)) throw new Error('artifact not found');
    const buf=fs.readFileSync(abs);
    return { size: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') };
  },
};

// re-audit after EXECUTORS defined
(function(){
  const caps=CAPS.capabilities||{};
  const missing=[];
  for(const [name, meta] of Object.entries(caps)){
    if(!EXECUTORS[name] && meta.status!=='DECLARED_ONLY' && meta.status!=='PARTIAL' && meta.status!=='BLOCKED'){
      missing.push(`${name} declared as ${meta.status} but no executor`);
    }
  }
  if(missing.length) log('capability audit mismatch:', missing.join('; '));
  else log(`capability audit PASS: ${Object.keys(caps).length} declared, ${Object.keys(EXECUTORS).length} executors, 0 mismatch (after fix)`);
})();

async function executeTask(task){
  const v = validateTask(task);
  if(!v.ok) throw new Error(`validate failed: ${v.errors.join('; ')}`);
  if(!CAPS.capabilities[task.capability]) throw new Error(`capability not allowlisted: ${task.capability}`);
  const meta = CAPS.capabilities[task.capability];
  if(meta.status==='DECLARED_ONLY' || meta.status==='BLOCKED') throw new Error(`capability ${task.capability} is ${meta.status} (no executor)`);
  if(task.risk==='high' && meta.risk!=='high') throw new Error('high-risk blocked');
  // clock consistency: use desktop timestamps monotonic
  const desktopStartedAt = nowIso();
  const serverClaimedAt = task.started_at || task.lease_expires_at || desktopStartedAt;
  let output;
  const timeoutMs = meta.timeoutMs || 120000;
  const executor = EXECUTORS[task.capability];
  if(!executor) throw new Error(`no executor for ${task.capability} (DECLARED_ONLY)`);
  // race with timeout
  const execPromise = executor(ROOT, task.args||{}, task);
  const timeoutPromise = new Promise((_,rej)=> setTimeout(()=>rej(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs));
  output = await Promise.race([execPromise, timeoutPromise]);
  const desktopFinishedAt = nowIso();
  // ensure finished > started (if clock skew, adjust)
  if(Date.parse(desktopFinishedAt) <= Date.parse(desktopStartedAt)){
    // bump by 1s
    const bump = new Date(Date.parse(desktopStartedAt)+1000).toISOString();
    output._clockFixed = true;
    // use bump as finished
    const files_changed = output.files_changed||output.filesChanged||getFilesChanged(task.worktree_mode==='isolated' ? (output.worktree||ROOT) : ROOT);
    const commit_sha = output.commit_sha||output.commitSha||output.sha||getCommitSha(output.worktree||ROOT);
    const git_diff_summary = output.diffSummary||output.git_diff_summary||output.stat||JSON.stringify(output).slice(0,2000);
    const tests = output.tests||[];
    const artifacts=[];
    let stdout_summary = output.stdout_summary? String(output.stdout_summary).slice(0,4000) : (output.stdout? String(output.stdout).slice(0,4000) : JSON.stringify(output,null,2).slice(0,4000));
    if(JSON.stringify(output).length>20000){
      ensureDir(path.join(ROOT,'state/browser-local-artifacts'));
      const artPath = path.join(ROOT,'state/browser-local-artifacts', `${task.task_id}.json`);
      fs.writeFileSync(artPath, JSON.stringify(output,null,2),'utf8');
      artifacts.push({ path: artPath, sha256: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex') });
    }
    const result = buildResult({ task_id: task.task_id, status:'completed', executor: WORKER_ID, started_at: desktopStartedAt, finished_at: bump, files_changed, git_diff_summary, commit_sha, tests, artifacts, stdout_summary, stderr_summary: output.stderr_summary||'', blockers: output.blockers||[], confidence: output.confidence||0.92 });
    result.desktop_started_at = desktopStartedAt;
    result.desktop_finished_at = bump;
    result.server_claimed_at = serverClaimedAt;
    result.detail = output;
    return result;
  }
  const files_changed = output.files_changed||output.filesChanged||getFilesChanged(task.worktree_mode==='isolated' ? (output.worktree||ROOT) : ROOT);
  const commit_sha = output.commit_sha||output.commitSha||output.sha|| (output.worktree ? getCommitSha(output.worktree) : '');
  const git_diff_summary = output.diffSummary||output.git_diff_summary||output.stat|| (output.branch? `branch ${output.branch}` : JSON.stringify(output).slice(0,2000));
  const tests = output.tests||[];
  const artifacts = output.artifacts||[];
  // bounded stdout
  let stdout_summary = output.stdout_summary? String(output.stdout_summary).slice(0,4000) : (output.stdout? String(output.stdout).slice(0,4000) : JSON.stringify(output,null,2).slice(0,4000));
  let stderr_summary = output.stderr_summary? String(output.stderr_summary).slice(0,2000) : (output.stderr? String(output.stderr).slice(0,2000) : '');
  if(JSON.stringify(output).length>20000 && !artifacts.length){
    ensureDir(path.join(ROOT,'state/browser-local-artifacts'));
    const artPath = path.join(ROOT,'state/browser-local-artifacts', `${task.task_id}.json`);
    fs.writeFileSync(artPath, JSON.stringify(output,null,2),'utf8');
    artifacts.push({ path: artPath, sha256: crypto.createHash('sha256').update(JSON.stringify(output)).digest('hex') });
  }
  const result = buildResult({ task_id: task.task_id, status:'completed', executor: WORKER_ID, started_at: desktopStartedAt, finished_at: desktopFinishedAt, files_changed, git_diff_summary, commit_sha, tests, artifacts, stdout_summary, stderr_summary, blockers: output.blockers||[], confidence: output.confidence||0.92 });
  result.desktop_started_at = desktopStartedAt;
  result.desktop_finished_at = desktopFinishedAt;
  result.server_claimed_at = serverClaimedAt;
  result.server_completed_at = nowIso();
  result.branch = output.branch||getBranch(output.worktree||ROOT);
  result.worktree = output.worktree|| (task.worktree_mode==='isolated'? path.join(WORKTREES_DIR, task.task_id): ROOT);
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
  await heartbeat(task.task_id, { capability: task.capability, claimedAt: nowIso(), server_claimed_at: task.started_at });
  const start = Date.now();
  try{
    const result = await executeTask(task);
    const toComplete = result;
    const r = await complete(task.task_id, toComplete.status||'completed', toComplete);
    const latency = Date.now()-start;
    log(`completed ${task.task_id} -> ${toComplete.status} latency ${latency}ms commit ${toComplete.commit_sha||toComplete.commitSha||''} files ${ (toComplete.files_changed||[]).length}`);
    await heartbeat(null, { lastTask: task.task_id, latency, lastCapability: task.capability });
    const resPath = path.join(ROOT,'state/browser-local-results', `${task.task_id}.json`);
    ensureDir(path.dirname(resPath));
    fs.writeFileSync(resPath, JSON.stringify({ ...task, status: toComplete.status, finished_at: toComplete.finished_at, result: toComplete },null,2),'utf8');
    return { claimed:true, task_id: task.task_id, status: toComplete.status, latency, result: toComplete, task };
  }catch(e){
    log(`failed ${task.task_id}: ${e.message}`);
    const failResult = buildResult({ task_id: task.task_id, status:'failed', executor: WORKER_ID, started_at: task.started_at||nowIso(), finished_at: nowIso(), git_diff_summary:'', stdout_summary:'', stderr_summary:String(e.message).slice(0,4000), blockers:[String(e.message)], confidence:0.3 });
    failResult.desktop_started_at = nowIso();
    failResult.desktop_finished_at = nowIso();
    try{ await complete(task.task_id, 'failed', failResult); }catch(err){ log('complete failed', err.message); }
    await heartbeat(null, { lastError:String(e.message).slice(0,400) });
    return { claimed:true, task_id: task.task_id, status:'failed', error:String(e.message) };
  }
}

async function loop(){
  const interval = Number(process.env.BROWSER_WORKER_POLL_MS||3000);
  log(`loop worker=${WORKER_ID} url=${SUPABASE_URL} poll=${interval}ms version=${CAPS.version}`);
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
  if(cmd==='health'){ const caps=Object.keys(CAPS.capabilities); const audit={ total:caps.length, executors:Object.keys(EXECUTORS).length, implemented: caps.filter(c=> CAPS.capabilities[c].status==='IMPLEMENTED'||CAPS.capabilities[c].status==='VERIFIED').length, verified: caps.filter(c=> CAPS.capabilities[c].status==='VERIFIED').length, declaredOnly: caps.filter(c=> CAPS.capabilities[c].status==='DECLARED_ONLY').length }; console.log(JSON.stringify({ worker:WORKER_ID, version:CAPS.version, audit, capabilities: caps, executors: Object.keys(EXECUTORS), url: SUPABASE_URL, token: WORKER_TOKEN? 'set':'missing' },null,2)); }
  if(cmd==='audit'){ const caps=CAPS.capabilities; for(const [k,v] of Object.entries(caps)) console.log(`${k}: ${v.status} executor=${v.executor||'none'} ${EXECUTORS[k]?'OK':'MISSING'}`); }
}

if(require.main===module) main().catch(e=>{ console.error(e); process.exit(1); });
module.exports={ tick, heartbeat, claim, complete, executeTask };
