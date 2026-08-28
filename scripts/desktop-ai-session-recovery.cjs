#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawnSync, spawn } = require('child_process');

const VERSION = '1.3.0';
const MANAGED_START = '<!-- WORLD_SERVER_SESSION_RECOVERY_V1_START -->';
const MANAGED_END = '<!-- WORLD_SERVER_SESSION_RECOVERY_V1_END -->';

function findCanonicalRepo() {
  const candidates = [];
  const desktop = path.join(os.homedir(), 'Desktop');
  try {
    for (const name of fs.readdirSync(desktop)) {
      const cand = path.join(desktop, name);
      if (fs.existsSync(path.join(cand, '.git')) && fs.existsSync(path.join(cand, 'package.json'))) {
        try {
          const r = spawnSync('git', ['remote','get-url','origin'], { cwd: cand, encoding: 'utf8', windowsHide: true });
          const remote = String(r.stdout||'').trim();
          if (remote.includes('mpaykin1/World_server')) candidates.push(cand);
        } catch {}
      }
    }
  } catch {}
  // Prefer World_server exact name
  const exact = path.join(desktop, 'World_server');
  if (candidates.includes(exact)) return exact;
  if (candidates.length) return candidates[0];
  return null;
}
function findRoot(start = process.cwd()) {
  let cur = path.resolve(start);
  while (true) {
    if (fs.existsSync(path.join(cur, 'package.json'))) {
      // If this root has .git and correct origin, use it
      if (fs.existsSync(path.join(cur, '.git'))) {
        try {
          const r = spawnSync('git', ['remote','get-url','origin'], { cwd: cur, encoding: 'utf8', windowsHide: true });
          const remote = String(r.stdout||'').trim();
          if (remote.includes('mpaykin1/World_server')) return cur;
        } catch {}
        // Has .git but not canonical -> still use if no canonical found
        const canonical = findCanonicalRepo();
        if (canonical && path.resolve(canonical) !== path.resolve(cur)) {
          console.warn(`[SESSION_RECOVERY] Auto-switching from ${cur} to canonical repo ${canonical} (wrong workdir/unicode path)`);
          return canonical;
        }
        return cur;
      }
      // No .git -> try canonical
      const canonical = findCanonicalRepo();
      if (canonical) {
        console.warn(`[SESSION_RECOVERY] Auto-switching from ${cur} (no .git) to canonical repo ${canonical}`);
        return canonical;
      }
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) {
      const canonical = findCanonicalRepo();
      if (canonical) {
        console.warn(`[SESSION_RECOVERY] Auto-switching from ${start} to canonical repo ${canonical} (package.json not found)`);
        return canonical;
      }
      throw new Error('Cannot find repository root (package.json).');
    }
    cur = parent;
  }
}

const ROOT = findRoot();
const STATE_DIR = path.join(ROOT, 'state', 'session-recovery');
const SNAP_DIR = path.join(STATE_DIR, 'snapshots');
const HISTORY_DIR = path.join(STATE_DIR, 'history');
const STALE_LOCK_DIR = path.join(STATE_DIR, 'stale-locks');
const STATE_FILE = path.join(STATE_DIR, 'current.json');
const EVENTS_FILE = path.join(STATE_DIR, 'events.jsonl');
const COMMANDS_FILE = path.join(STATE_DIR, 'commands.jsonl');
const RESUME_FILE = path.join(STATE_DIR, 'DESKTOP_AI_RESUME.md');
const UNFINISHED_FILE = path.join(STATE_DIR, 'UNFINISHED_WORK.json');
const LOCK_FILE = path.join(STATE_DIR, 'operation.lock.json');
const HEALTH_FILE = path.join(STATE_DIR, 'SESSION_HEALTH.json');
const WATCHDOG_STATE_FILE = path.join(STATE_DIR, 'watchdog-state.json');
const WATCHDOG_LOCK_FILE = path.join(STATE_DIR, 'watchdog.lock.json');
const WATCHDOG_CMD_FILE = path.join(STATE_DIR, 'session-watchdog.cmd');
const RECOVERY_REQUEST_FILE = path.join(STATE_DIR, 'WATCHDOG_RECOVERY_REQUEST.md');
const AUTO_STATE_FILE = path.join(STATE_DIR, 'auto-recovery-state.json');
const AUTO_LOCK_FILE = path.join(STATE_DIR, 'auto-recovery.lock.json');
const AUTO_LOG_FILE = path.join(STATE_DIR, 'auto-recovery.log');
const AUTO_AGENT_LOG_FILE = path.join(STATE_DIR, 'auto-agent.log');
const AUTO_AGENT_PROMPT_FILE = path.join(STATE_DIR, 'AUTO_RECOVERY_PROMPT.md');
const POLICY_FILE = path.join(ROOT, 'data', 'desktop-ai-session-recovery-policy.json');
const WIP_FILE = path.join(ROOT, 'WORK_IN_PROGRESS.md');

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }
function nowIso() { return new Date().toISOString(); }
function safeJson(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}
function appendJsonl(file, value) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, JSON.stringify(value) + '\n', 'utf8');
}
function sha256Text(s) { return crypto.createHash('sha256').update(String(s)).digest('hex'); }
function tailText(s, limit = 12000) {
  s = String(s || '');
  return s.length <= limit ? s : s.slice(-limit);
}

function policy() {
  return Object.assign({
    schemaVersion: 1,
    staleActivityMinutes: 10,
    operationLockMinutes: 10,
    foreignHostLockMinutes: 30,
    maxSnapshots: 40,
    maxCommandTailChars: 12000,
    syncWipOnCheckpoint: true,
    trustGitOverState: true,
    neverAutoCommit: true,
    neverAutoPush: true,
    neverClearLiveLock: true,
    discoverUnfinishedOnResume: true,
    watchdogIntervalMinutes: 2,
    liveActivityMinutes: 2,
    actionRequiredMinutes: 5,
    stalledMinutes: 12,
    schedulerOverdueGraceMinutes: 3,
    autoRecoveryEnabled: true,
    autoSchedulerKickEnabled: true,
    autoSchedulerKickCooldownMinutes: 4,
    autoAgentEnabled: true,
    autoAgentCandidates: ['opencode','opencode2'],
    autoAgentCooldownMinutes: 10,
    autoAgentMaxNoProgressAttempts: 3,
    autoActionLockMinutes: 10,
    watchdogLockMinutes: 3,
    validWaitingMarkers: ['long-soak-runner.cjs','autonomous-blocker-repair.cjs','quality_autoloop','blocker-repair-tick','npm run blockers:loop'],
    optionalExternalCapabilities: ['android','fresh-android-device','ios','fresh-ios-device','remote-cas','remote-cas-peer'],
    processMarkers: ['long-soak-runner.cjs','autonomous-blocker-repair.cjs','quality_autoloop','toolchain-bootstrap.cjs','vercel inspect','npm run blockers:','opencode run','opencode2 run'],
  }, safeJson(POLICY_FILE, {}));
}

function processAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
}

function acquireLock(op) {
  ensureDir(STATE_DIR); ensureDir(STALE_LOCK_DIR);
  const p = policy();
  if (fs.existsSync(LOCK_FILE)) {
    const old = safeJson(LOCK_FILE, {});
    const ageMs = Date.now() - new Date(old.createdAt || 0).getTime();
    const sameHost = !old.host || old.host === os.hostname();
    const alive = sameHost && processAlive(Number(old.pid));
    const ttlMs = (sameHost ? p.operationLockMinutes : p.foreignHostLockMinutes) * 60 * 1000;
    if (alive && p.neverClearLiveLock) {
      const e = new Error(`Session recovery operation is active: pid=${old.pid} op=${old.op || 'unknown'}`);
      e.code = 'LIVE_LOCK'; throw e;
    }
    const safelyDeadSameHost = sameHost && !alive;
    const safelyExpiredForeign = !sameHost && ageMs >= ttlMs;
    if (safelyDeadSameHost || safelyExpiredForeign) {
      const dest = path.join(STALE_LOCK_DIR, `operation-${Date.now()}-${old.pid || 'unknown'}.lock.json`);
      fs.renameSync(LOCK_FILE, dest);
      appendJsonl(EVENTS_FILE, { at: nowIso(), type: 'stale_lock_quarantined', old, reason: safelyDeadSameHost ? 'same_host_pid_dead' : 'foreign_lock_expired', dest: path.relative(ROOT, dest) });
    } else {
      const e = new Error(`Session recovery lock exists and is not safely stale yet: pid=${old.pid || '?'} ageMs=${ageMs}`);
      e.code = 'LOCK_NOT_STALE'; throw e;
    }
  }
  const lock = { schemaVersion: 1, pid: process.pid, host: os.hostname(), op, createdAt: nowIso() };
  writeJsonAtomic(LOCK_FILE, lock);
  return () => {
    try {
      const cur = safeJson(LOCK_FILE, {});
      if (Number(cur.pid) === process.pid) fs.unlinkSync(LOCK_FILE);
    } catch {}
  };
}


function acquireWatchdogLock() {
  ensureDir(STATE_DIR);
  const p = policy();
  if (fs.existsSync(WATCHDOG_LOCK_FILE)) {
    const old = safeJson(WATCHDOG_LOCK_FILE, {});
    const sameHost = !old.host || old.host === os.hostname();
    const alive = sameHost && processAlive(Number(old.pid));
    const ageMs = Date.now() - new Date(old.createdAt || 0).getTime();
    if (alive) {
      const e = new Error(`Watchdog already active: pid=${old.pid}`); e.code = 'WATCHDOG_BUSY'; throw e;
    }
    if (!sameHost && ageMs < Number(p.watchdogLockMinutes || 3) * 60 * 1000) {
      const e = new Error('Foreign watchdog lock is not stale yet.'); e.code = 'WATCHDOG_LOCK_NOT_STALE'; throw e;
    }
    try { fs.unlinkSync(WATCHDOG_LOCK_FILE); } catch {}
  }
  writeJsonAtomic(WATCHDOG_LOCK_FILE, { schemaVersion:1, pid:process.pid, host:os.hostname(), createdAt:nowIso() });
  return () => { try { const cur=safeJson(WATCHDOG_LOCK_FILE,{}); if(Number(cur.pid)===process.pid) fs.unlinkSync(WATCHDOG_LOCK_FILE); } catch {} };
}

function primaryLockReality() {
  if (!fs.existsSync(LOCK_FILE)) return { exists:false, alive:false, pid:null, op:null, ageMinutes:null, raw:null };
  const raw = safeJson(LOCK_FILE, {});
  const sameHost = !raw.host || raw.host === os.hostname();
  const alive = sameHost && processAlive(Number(raw.pid));
  const ageMinutes = Math.max(0, (Date.now() - new Date(raw.createdAt || 0).getTime()) / 60000);
  return { exists:true, alive, sameHost, pid:Number(raw.pid)||null, op:raw.op||null, ageMinutes:Number(ageMinutes.toFixed(2)), raw };
}

function fileSignal(file) {
  try { const st=fs.statSync(file); return { exists:true, mtimeMs:st.mtimeMs, size:st.size }; } catch { return { exists:false, mtimeMs:0, size:0 }; }
}
function progressFingerprint(s) {
  const files = [
    WIP_FILE,
    path.join(ROOT,'state','blocker-repair','state.json'),
    path.join(ROOT,'state','blocker-repair','latest-gates.json'),
    path.join(ROOT,'state','blocker-repair','long-soak.log'),
    COMMANDS_FILE,
  ];
  const g = gitReality();
  const compact = {
    sessionId:s?.sessionId||null, status:s?.status||null, lastActivityAt:s?.lastActivityAt||null,
    checkpointAt:s?.checkpoint?.at||null, activeRunId:s?.activeCommand?.runId||null,
    steps:(s?.steps||[]).map(x=>[x.id,x.status,x.updatedAt||null]),
    git:{head:g.head,branch:g.branch,dirty:g.dirty,changedCount:g.changedCount},
    files:files.map(f=>[path.relative(ROOT,f),fileSignal(f)])
  };
  return sha256Text(JSON.stringify(compact));
}
function waitingMarkerHit(command) {
  const c=String(command||'').toLowerCase();
  return (policy().validWaitingMarkers||[]).find(m=>c.includes(String(m).toLowerCase())) || null;
}
function timerReality(scan, now = Date.now()) {
  const times=[];
  if (scan?.blockerRepair?.nextRunAt) times.push({source:'blockerRepair.nextRunAt',raw:scan.blockerRepair.nextRunAt});
  for (const x of scan?.items||[]) if (x?.details?.nextRunAt) times.push({source:x.id,raw:x.details.nextRunAt});
  const valid=times.map(x=>({...x,t:new Date(x.raw).getTime()})).filter(x=>Number.isFinite(x.t)).sort((a,b)=>a.t-b.t);
  const future=valid.filter(x=>x.t>now);
  const due=valid.filter(x=>x.t<=now);
  const earliestFuture=future[0]||null;
  const latestDue=due.length?due[0]:null;
  return {
    nextFutureAt:earliestFuture?.raw||null,
    nextFutureSource:earliestFuture?.source||null,
    overdueAt:latestDue?.raw||null,
    overdueSource:latestDue?.source||null,
    overdueMinutes:latestDue?Number(((now-latestDue.t)/60000).toFixed(2)):0,
    total:valid.length,
  };
}
function hardBlockingItems(scan) {
  return (scan?.items||[]).filter(x=>x.blocking && !['waiting','running'].includes(normalizeStatus(x.status)));
}
function autoAgentReality() {
  const st=safeJson(AUTO_STATE_FILE,{});
  const pid=Number(st.autoAgentPid)||null;
  return { pid, alive:processAlive(pid), startedAt:st.autoAgentStartedAt||null, executable:st.autoAgentExecutable||null, launchCount:Number(st.autoAgentLaunchCount||0), fingerprint:st.blockingFingerprint||null };
}
function classifySessionHealth(s, scan, processes, primary, prev) {
  const p=policy();
  const now=Date.now();
  const fingerprint=progressFingerprint(s);
  const changed=!prev || prev.fingerprint!==fingerprint;
  const activityMs=now-new Date(s?.lastActivityAt||s?.updatedAt||0).getTime();
  const activityMinutes=Math.max(0, activityMs/60000);
  const activeCommand=s?.activeCommand?.command||null;
  const commandActive=activeCommand?commandAppearsActive(activeCommand,processes):false;
  const waitMarker=activeCommand?waitingMarkerHit(activeCommand):null;
  const timers=timerReality(scan,now);
  const hard=hardBlockingItems(scan);
  const hasUnfinished=Boolean((scan?.items||[]).length);
  const runningKnown=(scan?.items||[]).some(x=>x.status==='running');
  const autoAgent=autoAgentReality();
  let status='LIVE', reason='observable progress or active work';
  // Prioritize WAITING_VALID when timer is pending and no hard blocking, even if other DEAD conditions would also match
  if (timers.nextFutureAt && hard.length===0 && !autoAgent.alive) {
    status='WAITING_VALID'; reason=`durable timer is pending until ${timers.nextFutureAt}`;
  } else if (!s || (s.status==='finished' && !hasUnfinished)) { status='IDLE'; reason='no active recovery session or unfinished work'; }
  else if (autoAgent.alive) { status='AUTO_RECOVERING'; reason=`automatic OpenCode recovery agent is active (pid ${autoAgent.pid})`; }
  else if (primary.exists && primary.sameHost && !primary.alive && !commandActive) { status='DEAD'; reason=`primary recovery lock pid ${primary.pid||'?'} is dead and no matching command process is active`; }
  else if (s?.watchdog?.status==='DEAD' && !primary.alive && !commandActive && hasUnfinished) { status='DEAD'; reason=s.watchdog.reason||'previous watchdog confirmed dead session and no responsible process has reappeared'; }
  else if (activeCommand && !commandActive && activityMinutes >= Number(p.liveActivityMinutes||2)) { status='DEAD'; reason='active command was recorded but no matching OS process remains'; }
  else if (activeCommand && commandActive && waitMarker) { status='WAITING_VALID'; reason=`known long/timer-managed process is alive (${waitMarker})`; }
  else if (timers.overdueAt && timers.overdueMinutes >= Number(p.schedulerOverdueGraceMinutes||3) && !primary.alive && !commandActive && !runningKnown) { status='SCHEDULER_OVERDUE'; reason=`durable timer ${timers.overdueSource||''} is overdue by ${timers.overdueMinutes.toFixed(1)} minute(s) and no responsible process is active`; }
  else if (hard.length && !primary.alive && !commandActive && !runningKnown && activityMinutes >= Number(p.actionRequiredMinutes||5)) { status='ACTION_REQUIRED'; reason=`${hard.length} blocking requires-ai/failed item(s) exist but no responsible process is active`; }
  else if (timers.nextFutureAt && hard.length===0) { status='WAITING_VALID'; reason=`durable timer is pending until ${timers.nextFutureAt}`; }
  else if (runningKnown && !changed) { status='WAITING_VALID'; reason='known managed background process is still running'; }
  else if ((primary.alive || commandActive) && activityMinutes >= Number(p.stalledMinutes||12) && !changed) { status='STALLED'; reason=`responsible process is alive but no durable progress was observed for ${activityMinutes.toFixed(1)} minute(s)`; }
  else if (!primary.alive && !commandActive && hard.length && activityMinutes >= Number(p.actionRequiredMinutes||5)) { status='ACTION_REQUIRED'; reason=`blocking work exists with no active worker after ${activityMinutes.toFixed(1)} minute(s)`; }
  else if (!primary.alive && !commandActive && hasUnfinished && activityMinutes >= Number(p.stalledMinutes||12) && !timers.nextFutureAt) { status='DEAD'; reason=`unfinished work exists but no responsible process is alive after ${activityMinutes.toFixed(1)} minute(s)`; }
  else if (changed || primary.alive || commandActive || activityMinutes < Number(p.liveActivityMinutes||2)) { status='LIVE'; reason=changed?'observable durable progress changed since previous watchdog tick':(primary.alive||commandActive?'responsible process is active':'recent session activity'); }
  else { status='LIVE'; reason='short grace period before ACTION_REQUIRED/DEAD classification'; }
  return { status, reason, fingerprint, changed, activityMinutes:Number(activityMinutes.toFixed(2)), commandActive, waitMarker,
    nextTimerAt:timers.nextFutureAt, timers, hardBlockingCount:hard.length, hardBlockingIds:hard.map(x=>x.id), autoAgent };
}

function acquireAutoLock() {
  ensureDir(STATE_DIR);
  const p=policy();
  if (fs.existsSync(AUTO_LOCK_FILE)) {
    const old=safeJson(AUTO_LOCK_FILE,{}); const sameHost=!old.host||old.host===os.hostname(); const alive=sameHost&&processAlive(Number(old.pid));
    const age=Date.now()-new Date(old.createdAt||0).getTime();
    if (alive) { const e=new Error(`Auto recovery already active: pid=${old.pid}`); e.code='AUTO_BUSY'; throw e; }
    if (!sameHost && age<Number(p.autoActionLockMinutes||10)*60000) { const e=new Error('Foreign auto-recovery lock is not stale yet'); e.code='AUTO_LOCK_NOT_STALE'; throw e; }
    try { fs.unlinkSync(AUTO_LOCK_FILE); } catch {}
  }
  writeJsonAtomic(AUTO_LOCK_FILE,{schemaVersion:1,pid:process.pid,host:os.hostname(),createdAt:nowIso()});
  return ()=>{ try { const cur=safeJson(AUTO_LOCK_FILE,{}); if(Number(cur.pid)===process.pid) fs.unlinkSync(AUTO_LOCK_FILE); } catch {} };
}
function appendAutoLog(obj) { appendJsonl(AUTO_LOG_FILE,{at:nowIso(),...obj}); }
function commandExists(name) {
  try {
    const tool=process.platform==='win32'?'where.exe':'which';
    const r=spawnSync(tool,[name],{encoding:'utf8',windowsHide:true});
    if(r.status!==0) return null;
    return String(r.stdout||'').split(/\r?\n/).map(x=>x.trim()).find(Boolean)||null;
  } catch { return null; }
}
function blockingFingerprint(scan) {
  const xs=hardBlockingItems(scan).map(x=>`${x.id}:${x.status}:${JSON.stringify(x.details||{})}`).sort();
  return sha256Text(xs.join('|'));
}
function buildAutoRecoveryPrompt(health,scan) {
  const blockers=hardBlockingItems(scan);
  const lines=blockers.map(x=>`- ${x.id}: ${x.title}\n  action: ${x.action}`).join('\n')||'- none';
  return `# WORLD SERVER AUTOMATIC RECOVERY JOB\n\nGenerated: ${nowIso()}\nHealth: ${health.status}\nReason: ${health.reason}\n\n## Mandatory startup\n1. Work only in ${ROOT}.\n2. Run npm run desktop-ai:health, npm run desktop-ai:resume, npm run desktop-ai:unfinished, git status.\n3. Read AGENTS.md, WORK_IN_PROGRESS.md, state/session-recovery/DESKTOP_AI_RESUME.md, state/session-recovery/UNFINISHED_WORK.json.\n4. Never start from scratch; continue from the last verified checkpoint.\n\n## Blocking work\n${lines}\n\n## Autonomous closure loop\n- checkpoint -> diagnose root cause -> smallest safe fix -> focused regression test -> npm run blockers:tick -> npm run blockers:status -> repeat.\n- If scheduler timers are overdue, diagnose/fix the scheduler/unified-tick root cause as well as running the missed tick.\n- Do not stop while a locally fixable required blocker remains. After 2-3 failed attempts, change strategy rather than repeating the same action.\n- Android/iOS/remote-CAS remain optional capabilities and may stay waiting. Never fake PASS. Never shorten the real 8h soak.\n- Never work directly on master and never merge master automatically. Follow AGENTS.md for branch/commit/push/PR rules.\n- Preserve existing working systems. Do not use SKIP_FULL_VERIFY to declare completion.\n- Final readiness requires mergeSafe:true, required requires_ai:0, local/release gates PASS, Vercel PASS, and longSoakCertified:true.\n\nWhen this run ends, leave durable evidence/checkpoint so the next watchdog tick can decide what remains.\n`;
}
function launchDetached(exe,args,logFile) {
  ensureDir(path.dirname(logFile));
  const fd=fs.openSync(logFile,'a');
  let child;
  if(process.platform==='win32' && /\.(cmd|bat)$/i.test(exe)) {
    // Use shell:true to let Node handle .cmd quoting correctly, supports Unicode and spaces
    child=spawn(exe,args,{cwd:ROOT,detached:true,windowsHide:true,stdio:['ignore',fd,fd],shell:true,windowsVerbatimArguments:false});
  } else {
    child=spawn(exe,args,{cwd:ROOT,detached:true,windowsHide:true,stdio:['ignore',fd,fd]});
  }
  if(!child.pid) {
    // Fallback: try via node + npm-cli
    try { fs.closeSync(fd); } catch {}
    throw new Error(`Failed to spawn detached ${exe} ${args.join(' ')}`);
  }
  child.unref(); try { fs.closeSync(fd); } catch {} return child.pid;
}
function launchBlockerTick() {
  // Prefer node + npm-cli.js to avoid .cmd quoting issues on Windows with spaces/unicode
  const npmCliCandidates = [
    'C:\\Program Files\\nodejs\\node_modules\\npm\\bin\\npm-cli.js',
    path.join(path.dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js'),
    path.join(path.dirname(process.execPath), '..', 'lib/node_modules/npm/bin/npm-cli.js'),
    path.join(ROOT, 'node_modules/npm/bin/npm-cli.js'),
  ];
  let npmCli = null;
  for (const p of npmCliCandidates) { try { if(fs.existsSync(p)) { npmCli = p; break; } } catch {} }
  if(npmCli) {
    const pid=launchDetached(process.execPath,[npmCli,'run','blockers:tick'],AUTO_LOG_FILE);
    appendAutoLog({type:'scheduler_kick',pid,command:'node '+npmCli+' run blockers:tick'}); return {launched:true,type:'scheduler_kick',pid};
  }
  const npm=process.platform==='win32'?(commandExists('npm.cmd')||commandExists('npm')||'npm.cmd'):(commandExists('npm')||'npm');
  const pid=launchDetached(npm,['run','blockers:tick'],AUTO_LOG_FILE);
  appendAutoLog({type:'scheduler_kick',pid,command:'npm run blockers:tick'}); return {launched:true,type:'scheduler_kick',pid};
}
function launchAutoAgent(health,scan,st) {
  const p=policy();
  let exe=null,name=null;
  for(const c of p.autoAgentCandidates||['opencode','opencode2']) { const x=commandExists(c); if(x){exe=x;name=c;break;} }
  if(!exe) return {launched:false,type:'auto_agent',reason:'OpenCode CLI not found (tried '+(p.autoAgentCandidates||[]).join(', ')+')'};
  const fp=blockingFingerprint(scan);
  const same=st.blockingFingerprint===fp;
  const attempts=same?Number(st.autoAgentLaunchCount||0):0;
  if(same && attempts>=Number(p.autoAgentMaxNoProgressAttempts||3)) return {launched:false,type:'auto_agent',escalation:true,reason:`No-progress automatic agent limit reached (${attempts}) for unchanged blocker fingerprint`};
  const prompt=buildAutoRecoveryPrompt(health,scan); fs.writeFileSync(AUTO_AGENT_PROMPT_FILE,prompt,'utf8');
  let help=''; try { const h=spawnSync(exe,['run','--help'],{cwd:ROOT,encoding:'utf8',windowsHide:true,timeout:15000}); help=String(h.stdout||'')+String(h.stderr||''); } catch {}
  const args=['run']; if(/--auto\b/.test(help)) args.push('--auto'); if(/--file\b/.test(help)) args.push('--file',AUTO_AGENT_PROMPT_FILE);
  args.push('Execute the World Server automatic recovery instructions. Continue until locally fixable required blockers are closed or a real external blocker is proven.');
  const pid=launchDetached(exe,args,AUTO_AGENT_LOG_FILE);
  const next={...st,autoAgentPid:pid,autoAgentStartedAt:nowIso(),autoAgentExecutable:exe,autoAgentName:name,blockingFingerprint:fp,autoAgentLaunchCount:attempts+1,lastAutoAgentLaunchAt:nowIso()};
  writeJsonAtomic(AUTO_STATE_FILE,next); appendAutoLog({type:'auto_agent_launch',pid,exe,name,attempt:attempts+1,fingerprint:fp});
  return {launched:true,type:'auto_agent',pid,exe,name,attempt:attempts+1};
}
function performAutoRecovery(health,s,scan) {
  const p=policy(); if(!p.autoRecoveryEnabled) return {enabled:false,launched:false,reason:'autoRecoveryEnabled=false'};
  let release; try { release=acquireAutoLock(); } catch(e){ return {enabled:true,launched:false,reason:e.message,code:e.code}; }
  try {
    let st=safeJson(AUTO_STATE_FILE,{schemaVersion:1}); const now=Date.now();
    const agent=autoAgentReality(); if(agent.alive) return {enabled:true,launched:false,active:true,type:'auto_agent',pid:agent.pid};
    if(health.status==='SCHEDULER_OVERDUE' && p.autoSchedulerKickEnabled) {
      const last=new Date(st.lastSchedulerKickAt||0).getTime(); const cooldown=Number(p.autoSchedulerKickCooldownMinutes||4)*60000;
      if(!last || now-last>=cooldown) { const r=launchBlockerTick(); st={...st,lastSchedulerKickAt:nowIso(),lastAction:'scheduler_kick'}; writeJsonAtomic(AUTO_STATE_FILE,st); return {enabled:true,...r}; }
      return {enabled:true,launched:false,type:'scheduler_kick',reason:'scheduler kick cooldown active'};
    }
    if(health.status==='ACTION_REQUIRED' && p.autoAgentEnabled) {
      const last=new Date(st.lastAutoAgentLaunchAt||0).getTime(); const cooldown=Number(p.autoAgentCooldownMinutes||10)*60000;
      if(last && now-last<cooldown) return {enabled:true,launched:false,type:'auto_agent',reason:'auto agent cooldown active'};
      return {enabled:true,...launchAutoAgent(health,scan,st)};
    }
    return {enabled:true,launched:false,reason:`No auto action for status ${health.status}`};
  } finally { release(); }
}

function writeRecoveryRequest(health) {
  ensureDir(STATE_DIR);
  const text=`# WATCHDOG RECOVERY REQUEST\n\nGenerated: ${health.checkedAt}\n\n- SESSION_STATUS: **${health.status}**\n- reason: ${health.reason}\n- primary lock: ${health.primaryLock.exists?`pid=${health.primaryLock.pid} alive=${health.primaryLock.alive} op=${health.primaryLock.op||'unknown'} age=${health.primaryLock.ageMinutes}m`:'none'}\n- active command: ${health.activeCommand?.command||'none'}\n- next timer: ${health.nextTimerAt||'none'}\n\n## Mandatory recovery protocol\n1. Start a fresh Desktop AI session if the current UI is unresponsive.\n2. Run \`npm run desktop-ai:resume\` before editing.\n3. Read \`SESSION_HEALTH.json\`, \`UNFINISHED_WORK.json\`, and \`WORK_IN_PROGRESS.md\`.\n4. If a responsible PID is still alive, do not kill or duplicate it merely because the UI froze. Inspect its state/logs first.\n5. If the PID is dead, let Session Recovery quarantine only the proven-dead lock, verify side effects, and continue from the checkpoint.\n6. Never fabricate PASS and never reset uncommitted work blindly.\n`;
  fs.writeFileSync(RECOVERY_REQUEST_FILE,text,'utf8');
}

function acquireReadGuard(op) {
  try { return { release: acquireLock(op), liveLock: null }; }
  catch (e) {
    if (e && e.code === 'LIVE_LOCK') {
      return { release: () => {}, liveLock: safeJson(LOCK_FILE, {}) };
    }
    throw e;
  }
}

function git(args, opts = {}) {
  const r = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024, ...opts });
  return { ok: r.status === 0, status: r.status, stdout: String(r.stdout || '').trim(), stderr: String(r.stderr || '').trim() };
}
function gitReality() {
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['rev-parse', 'HEAD']);
  const status = git(['status', '--porcelain=v1']);
  const remote = git(['remote', 'get-url', 'origin']);
  const lines = status.ok && status.stdout ? status.stdout.split(/\r?\n/).filter(Boolean) : [];
  return {
    available: branch.ok && head.ok,
    branch: branch.ok ? branch.stdout : null,
    head: head.ok ? head.stdout : null,
    origin: remote.ok ? remote.stdout : null,
    dirty: lines.length > 0,
    statusLines: lines.slice(0, 250),
    changedCount: lines.length,
    capturedAt: nowIso(),
  };
}
function isAncestor(oldHead, newHead) {
  if (!oldHead || !newHead) return null;
  const r = git(['merge-base', '--is-ancestor', oldHead, newHead]);
  if (r.status === 0) return true;
  if (r.status === 1) return false;
  return null;
}

function parseWipSections(raw) {
  const sections = {};
  let current = null;
  let buf = [];
  const flush = () => { if (current !== null) sections[current.toLowerCase()] = buf.join('\n').trim(); };
  for (const line of String(raw || '').split(/\r?\n/)) {
    const m = line.match(/^##\s+(.+?)\s*$/);
    if (m) { flush(); current = m[1].trim(); buf = []; }
    else if (current !== null) buf.push(line);
  }
  flush();
  return sections;
}
function readWip() {
  if (!fs.existsSync(WIP_FILE)) return { exists: false, raw: '', sections: {} };
  const raw = fs.readFileSync(WIP_FILE, 'utf8');
  return { exists: true, raw, sections: parseWipSections(raw) };
}
function wipValue(w, names) {
  for (const n of names) {
    const v = w.sections[String(n).toLowerCase()];
    if (v) return v;
  }
  return null;
}

function defaultState() {
  const w = readWip();
  const g = gitReality();
  return {
    schemaVersion: 1,
    engineVersion: VERSION,
    sessionId: `session-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    status: 'in_progress',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    lastActivityAt: nowIso(),
    lastHeartbeatAt: nowIso(),
    task: wipValue(w, ['Task', 'What we are doing']) || 'Recover and continue WORK_IN_PROGRESS.md',
    targetState: wipValue(w, ['Target state']) || null,
    completionCriteria: wipValue(w, ['Completion criteria']) || null,
    testsToRun: wipValue(w, ['Tests to run']) || null,
    nextAction: wipValue(w, ['Next action']) || null,
    steps: [],
    lastSuccessfulCommand: null,
    lastError: null,
    activeCommand: null,
    discoveredWork: null,
    checkpoint: { at: nowIso(), message: 'Session recovery initialized', git: g, snapshot: null },
    resumeCount: 0,
    warnings: [],
  };
}
function loadState(create = false) {
  const s = safeJson(STATE_FILE, null);
  if (s) return s;
  if (!create) return null;
  const n = defaultState(); writeJsonAtomic(STATE_FILE, n); return n;
}
function saveState(s, eventType, extra = {}) {
  s.updatedAt = nowIso();
  s.lastActivityAt = s.updatedAt;
  s.engineVersion = VERSION;
  writeJsonAtomic(STATE_FILE, s);
  if (eventType) appendJsonl(EVENTS_FILE, { at: s.updatedAt, sessionId: s.sessionId, type: eventType, ...extra });
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { out._.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 2) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

function managedReplace(raw, block) {
  const start = raw.indexOf(MANAGED_START);
  const end = raw.indexOf(MANAGED_END);
  if (start >= 0 && end > start) return raw.slice(0, start).replace(/\s+$/, '') + '\n\n' + block + '\n' + raw.slice(end + MANAGED_END.length).replace(/^\s+/, '');
  return raw.replace(/\s+$/, '') + '\n\n' + block + '\n';
}
function stepSummary(s) {
  if (!s.steps.length) return '- no explicit recovery steps registered yet';
  return s.steps.map((x, i) => `- ${i + 1}. [${x.status}] ${x.id}: ${x.title}${x.command ? ` — \`${x.command}\`` : ''}`).join('\n');
}
function syncWip(s) {
  if (!policy().syncWipOnCheckpoint || !fs.existsSync(WIP_FILE)) return;
  const raw = fs.readFileSync(WIP_FILE, 'utf8');
  const block = `${MANAGED_START}\n## Desktop AI Session Recovery V1 — managed checkpoint\n\n- sessionId: \`${s.sessionId}\`\n- status: \`${s.status}\`\n- checkpoint: \`${s.checkpoint?.at || 'none'}\`\n- checkpoint message: ${s.checkpoint?.message || 'none'}\n- last successful command: ${s.lastSuccessfulCommand ? `\`${s.lastSuccessfulCommand.command}\` (${s.lastSuccessfulCommand.at})` : 'none'}\n- last error: ${s.lastError ? `${s.lastError.command || s.lastError.stepId || 'operation'} — ${String(s.lastError.message || '').replace(/\s+/g, ' ').slice(0, 500)}` : 'none'}\n- next action: ${String(s.nextAction || 'derive from unresolved recovery step').replace(/\n/g, ' ')}\n\n### Recovery queue\n${stepSummary(s)}\n\n> New Desktop AI session: run \`npm run desktop-ai:resume\` before editing. Git reality overrides stale recovery metadata.\n${MANAGED_END}`;
  const next = managedReplace(raw, block);
  if (next !== raw) fs.writeFileSync(WIP_FILE, next, 'utf8');
}

function snapshot(s, message) {
  ensureDir(SNAP_DIR);
  const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(2).toString('hex')}`;
  const unstaged = git(['diff', '--binary', '--no-ext-diff']);
  const staged = git(['diff', '--cached', '--binary', '--no-ext-diff']);
  const g = gitReality();
  const meta = {
    schemaVersion: 1, id, at: nowIso(), sessionId: s.sessionId, message,
    git: g,
    unstagedPatchSha256: sha256Text(unstaged.stdout || ''),
    stagedPatchSha256: sha256Text(staged.stdout || ''),
  };
  fs.writeFileSync(path.join(SNAP_DIR, `${id}.unstaged.patch`), unstaged.ok ? unstaged.stdout + '\n' : '', 'utf8');
  fs.writeFileSync(path.join(SNAP_DIR, `${id}.staged.patch`), staged.ok ? staged.stdout + '\n' : '', 'utf8');
  writeJsonAtomic(path.join(SNAP_DIR, `${id}.json`), meta);
  const files = fs.readdirSync(SNAP_DIR).filter(x => x.endsWith('.json')).sort();
  const max = policy().maxSnapshots;
  if (files.length > max) {
    for (const f of files.slice(0, files.length - max)) {
      const base = f.slice(0, -5);
      for (const ext of ['.json', '.unstaged.patch', '.staged.patch']) {
        try { fs.unlinkSync(path.join(SNAP_DIR, base + ext)); } catch {}
      }
    }
  }
  return meta;
}

function classifyGit(state, current) {
  const old = state?.checkpoint?.git || null;
  const warnings = [];
  if (!current.available) warnings.push('Git repository state could not be read. Do not make destructive changes until Git is available.');
  if (old?.branch && current.branch && old.branch !== current.branch) warnings.push(`Branch changed since checkpoint: ${old.branch} -> ${current.branch}. Verify this is intentional.`);
  if (old?.head && current.head && old.head !== current.head) {
    const ancestor = isAncestor(old.head, current.head);
    if (ancestor === true) warnings.push(`HEAD advanced since checkpoint: ${old.head.slice(0, 8)} -> ${current.head.slice(0, 8)}. Reconcile new commits before continuing.`);
    else warnings.push(`HEAD diverged from checkpoint: ${old.head.slice(0, 8)} -> ${current.head.slice(0, 8)}. Git reality must be investigated before applying queued edits.`);
  }
  return warnings;
}


function normalizeStatus(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, '_'); }
function isUnfinishedStatus(v) {
  return new Set(['running','in_progress','pending','failed','requires_ai','waiting','blocked','queued','retry','retrying']).has(normalizeStatus(v));
}
function isOptionalExternalId(id) {
  const x = String(id || '').toLowerCase();
  return (policy().optionalExternalCapabilities || []).some(v => x === String(v).toLowerCase() || x.includes(String(v).toLowerCase()));
}
function jsonObjectsWithStatus(value, out = [], pathParts = [], depth = 0) {
  if (depth > 10 || value == null) return out;
  if (Array.isArray(value)) {
    value.forEach((v, i) => jsonObjectsWithStatus(v, out, pathParts.concat(String(i)), depth + 1));
    return out;
  }
  if (typeof value !== 'object') return out;
  if (Object.prototype.hasOwnProperty.call(value, 'status') && isUnfinishedStatus(value.status)) {
    const id = value.id || value.key || value.name || value.blocker || value.slug || pathParts[pathParts.length - 1] || 'unknown';
    out.push({
      id: String(id), status: normalizeStatus(value.status),
      nextRunAt: value.nextRunAt || value.next_run_at || value.retryAt || value.retry_at || null,
      reason: value.reason || value.message || value.error || value.details || null,
      path: pathParts.join('.'), raw: value,
    });
  }
  for (const [k, v] of Object.entries(value)) jsonObjectsWithStatus(v, out, pathParts.concat(k), depth + 1);
  return out;
}
function dedupeBy(items, keyFn) {
  const seen = new Set(); const out = [];
  for (const item of items) { const k = keyFn(item); if (seen.has(k)) continue; seen.add(k); out.push(item); }
  return out;
}
function readProcessTable() {
  try {
    if (process.platform === 'win32') {
      const ps = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-Command',
        'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress'],
        { encoding:'utf8', windowsHide:true, maxBuffer:32*1024*1024 });
      if (ps.status !== 0 || !String(ps.stdout || '').trim()) return [];
      let data = JSON.parse(String(ps.stdout).trim()); if (!Array.isArray(data)) data = [data];
      return data.map(x => ({ pid:Number(x.ProcessId), ppid:Number(x.ParentProcessId), name:String(x.Name || ''), commandLine:String(x.CommandLine || '') }));
    }
    const ps = spawnSync('ps', ['-eo','pid=,ppid=,comm=,args='], { encoding:'utf8', windowsHide:true, maxBuffer:32*1024*1024 });
    if (ps.status !== 0) return [];
    return String(ps.stdout || '').split(/\r?\n/).map(line => {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/); if (!m) return null;
      return { pid:Number(m[1]), ppid:Number(m[2]), name:m[3], commandLine:m[4] || m[3] };
    }).filter(Boolean);
  } catch { return []; }
}
function markerForCommand(command) {
  const s = String(command || '');
  const cjs = s.match(/([A-Za-z0-9_.-]+\.cjs)/i); if (cjs) return cjs[1].toLowerCase();
  const npm = s.match(/npm(?:\.cmd)?\s+run\s+([A-Za-z0-9:_-]+)/i); if (npm) return `run ${npm[1].toLowerCase()}`;
  const vercel = s.match(/vercel\s+(inspect|deploy|build)/i); if (vercel) return `vercel ${vercel[1].toLowerCase()}`;
  return s.toLowerCase().split(/\s+/).filter(x => x.length >= 8).slice(-2).join(' ');
}
function commandAppearsActive(command, processes) {
  const marker = markerForCommand(command); if (!marker) return false;
  return processes.some(p => p.pid !== process.pid && String(p.commandLine || '').toLowerCase().includes(marker));
}
function discoverKnownProcesses(processes) {
  const markers = (policy().processMarkers || []).map(x => String(x).toLowerCase());
  const out = [];
  for (const p of processes) {
    if (!p || p.pid === process.pid) continue;
    const procName = String(p.name || '').toLowerCase();
    const eligible = /^(node(?:\.exe)?|npm(?:\.cmd)?|npx(?:\.cmd)?|powershell(?:\.exe)?|pwsh(?:\.exe)?)$/.test(procName);
    if (!eligible) continue;
    const cmd = String(p.commandLine || '').toLowerCase();
    const hit = markers.find(m => cmd.includes(m));
    if (!hit) continue;
    out.push({ id:`pid-${p.pid}`, source:'os-process', status:'running', priority:'managed', blocking:false,
      title:`Background process still running: ${hit}`, action:'Do not start a duplicate. Inspect its durable state/output and let it finish or fail naturally.',
      details:{ pid:p.pid, ppid:p.ppid, name:p.name, marker:hit, commandLine:tailText(p.commandLine, 1200) } });
  }
  return out;
}
function discoverBlockerRepair() {
  const file = path.join(ROOT, 'state', 'blocker-repair', 'state.json');
  if (!fs.existsSync(file)) return { exists:false, items:[], mergeSafe:null, nextRunAt:null };
  const state = safeJson(file, {});
  const found = dedupeBy(jsonObjectsWithStatus(state), x => `${x.id}|${x.status}|${x.path}`);
  const items = found.map(x => {
    const optional = isOptionalExternalId(x.id);
    const scheduled = x.nextRunAt && new Date(x.nextRunAt).getTime() > Date.now();
    const hard = ['failed','requires_ai','blocked'].includes(x.status) && !optional;
    let action = hard ? `Continue repair of blocker ${x.id}; diagnose root cause, apply smallest safe fix, regression-test, then run blockers:tick.` :
      scheduled ? `Timer-managed blocker ${x.id}; do not duplicate. Re-check at/after ${x.nextRunAt}.` :
      `Re-check blocker ${x.id} with npm run blockers:tick; do not fabricate PASS.`;
    return { id:`blocker:${x.id}`, source:'blocker-repair', status:x.status, priority:hard?'high':'managed', blocking:hard,
      optional, title:`Blocker repair: ${x.id} = ${x.status}`, action,
      details:{ nextRunAt:x.nextRunAt, reason:x.reason ? tailText(typeof x.reason === 'string' ? x.reason : JSON.stringify(x.reason), 1200) : null, path:x.path } };
  });
  const nextRunAt = state.nextRunAt || state.nextRun || state.next_run_at || null;
  return { exists:true, items, mergeSafe: typeof state.mergeSafe === 'boolean' ? state.mergeSafe : null, nextRunAt };
}
function discoverWipItem() {
  const w = readWip(); if (!w.exists) return null;
  const next = wipValue(w, ['Next action']); if (!next) return null;
  return { id:'wip:next-action', source:'work-in-progress', status:'pending', priority:'normal', blocking:false,
    title:'WORK_IN_PROGRESS has an unfinished Next action', action:tailText(next, 3000), details:{} };
}
function scanUnfinished(s) {
  const processes = readProcessTable();
  const items = [];
  for (const step of s.steps || []) {
    if (!['pass','skipped'].includes(normalizeStatus(step.status))) items.push({ id:`recovery:${step.id}`, source:'recovery-queue', status:normalizeStatus(step.status), priority:'high', blocking:true,
      title:`Recovery queue step ${step.id}: ${step.title}`, action:step.command ? `Continue/verify: ${step.command}` : `Continue and verify step ${step.id}.`, details:{ criteria:step.criteria || null, attempts:step.attempts || 0 } });
  }
  if (s.activeCommand && s.activeCommand.command) {
    const active = commandAppearsActive(s.activeCommand.command, processes);
    items.push({ id:`command:${s.activeCommand.runId || 'active'}`, source: active ? 'active-command' : 'interrupted-command',
      status:active?'running':'interrupted', priority:'critical', blocking:!active,
      title:active ? `Previously started command is still running: ${s.activeCommand.command}` : `Command was started but no completion was recorded: ${s.activeCommand.command}`,
      action:active ? 'Do not restart it. Inspect durable output/state and wait for real completion.' : 'Verify side effects/output first. If incomplete, resume or rerun safely from the last checkpoint; do not assume it failed or passed.',
      details:{ ...s.activeCommand, appearsActive:active } });
  }
  const blocker = discoverBlockerRepair(); items.push(...blocker.items);
  items.push(...discoverKnownProcesses(processes));
  const wip = discoverWipItem(); if (wip) items.push(wip);
  const g = gitReality();
  if (g.dirty) items.push({ id:'git:dirty-worktree', source:'git', status:'uncommitted', priority:'high', blocking:false,
    title:`Git worktree contains ${g.changedCount} uncommitted change(s)`, action:'Reconcile git diff/status with the checkpoint before editing. Preserve valid unfinished changes; never blindly reset them.', details:{ statusLines:g.statusLines } });
  const deduped = dedupeBy(items, x => x.id);
  const counts = deduped.reduce((a,x) => { a.total++; if (x.blocking) a.blocking++; if (x.status === 'running') a.running++; if (x.status === 'waiting') a.waiting++; return a; }, {total:0,blocking:0,running:0,waiting:0});
  return { schemaVersion:1, engineVersion:VERSION, scannedAt:nowIso(), sessionId:s.sessionId, counts,
    blockerRepair:{ exists:blocker.exists, mergeSafe:blocker.mergeSafe, nextRunAt:blocker.nextRunAt }, git:g, items:deduped };
}
function persistUnfinished(s, scan) {
  writeJsonAtomic(UNFINISHED_FILE, scan);
  s.discoveredWork = { scannedAt:scan.scannedAt, counts:scan.counts, blockerRepair:scan.blockerRepair,
    items:scan.items.slice(0,100).map(x => ({ id:x.id, source:x.source, status:x.status, blocking:x.blocking, title:x.title, action:x.action })) };
}
function unfinishedSummary(scan) {
  if (!scan || !scan.items || !scan.items.length) return '- No unfinished durable/background work discovered beyond the current session metadata.';
  return scan.items.map((x,i) => `- ${i+1}. [${x.status}] [${x.source}] ${x.title}\n  - action: ${String(x.action || '').replace(/\n/g,' ').slice(0,1200)}${x.blocking?'\n  - BLOCKING: true':''}`).join('\n');
}
function bestNextAction(s, scan) {
  const critical = (scan.items || []).find(x => x.source === 'interrupted-command') || (scan.items || []).find(x => x.blocking) || (scan.items || []).find(x => x.source === 'active-command');
  if (critical) return critical.action;
  const step = unresolvedStep(s); if (step) return `${step.id}: ${step.title}${step.command ? ` — command: ${step.command}` : ''}`;
  const actionable = (scan.items || []).find(x => !['waiting','running'].includes(x.status)); if (actionable) return actionable.action;
  if ((scan.items || []).some(x => ['waiting','running'].includes(x.status))) return 'Do not duplicate running/timer-managed work. Inspect its durable state and continue when its next condition/time is reached.';
  return s.nextAction || 'Read WORK_IN_PROGRESS.md and verify completion criteria.';
}

function unresolvedStep(s) {
  return s.steps.find(x => x.status === 'running') || s.steps.find(x => x.status === 'failed') || s.steps.find(x => x.status === 'pending') || s.steps.find(x => x.status === 'blocked') || null;
}
function buildResume(s, current, warnings, scan) {
  const staleMin = Math.max(0, Math.floor((Date.now() - new Date(s.lastActivityAt || s.updatedAt || 0).getTime()) / 60000));
  const next = bestNextAction(s, scan);
  return `# DESKTOP AI RESUME PACKET\n\nGenerated: ${nowIso()}\nEngine: Session Recovery V${VERSION}\n\n## Mandatory first rule\nDo **not** restart the task from scratch. Verify repository reality first, then continue from the first unresolved verified checkpoint. Never fake evidence and never push directly to master.\n\n## Session\n- id: \`${s.sessionId}\`\n- status: \`${s.status}\`\n- task: ${s.task}\n- inactivity before this resume: ${staleMin} minute(s)\n- resume count: ${s.resumeCount}\n\n## Git reality now\n- branch: \`${current.branch || 'UNKNOWN'}\`\n- HEAD: \`${current.head || 'UNKNOWN'}\`\n- dirty: \`${current.dirty}\` (${current.changedCount} status line(s))\n- origin: \`${current.origin || 'UNKNOWN'}\`\n\n## Last checkpoint\n- at: \`${s.checkpoint?.at || 'none'}\`\n- message: ${s.checkpoint?.message || 'none'}\n- branch then: \`${s.checkpoint?.git?.branch || 'UNKNOWN'}\`\n- HEAD then: \`${s.checkpoint?.git?.head || 'UNKNOWN'}\`\n- snapshot: \`${s.checkpoint?.snapshot?.id || 'none'}\`\n\n## Last successful command\n${s.lastSuccessfulCommand ? `- command: \`${s.lastSuccessfulCommand.command}\`\n- at: \`${s.lastSuccessfulCommand.at}\`\n- exit: \`${s.lastSuccessfulCommand.exitCode}\`` : '- none recorded'}\n\n## Last error\n${s.lastError ? `- operation: \`${s.lastError.command || s.lastError.stepId || 'unknown'}\`\n- at: \`${s.lastError.at || 'unknown'}\`\n- message: ${String(s.lastError.message || '').replace(/\n/g, ' ').slice(0, 1200)}` : '- none recorded'}\n\n## Recovery queue\n${stepSummary(s)}\n\n## Discovered unfinished work / background processes\n${unfinishedSummary(scan)}\n\n## Warnings / reconciliation\n${warnings.length ? warnings.map(x => `- WARNING: ${x}`).join('\n') : '- No checkpoint/Git divergence detected.'}\n\n## Exact next action\n${next}\n\n## Continuation protocol\n1. Read \`WORK_IN_PROGRESS.md\`, this packet, and \`state/session-recovery/UNFINISHED_WORK.json\`.\n2. Run \`git status\` and confirm branch/HEAD above. Git wins if state is stale.\n3. Reconcile discovered unfinished processes first. If one is still running, do not start a duplicate. If a command was interrupted, verify side effects before rerunning. Then continue the first unresolved queue step; do not repeat PASS steps.\n4. Before risky edits/deploy/migration run \`npm run desktop-ai:checkpoint -- --message "<what is verified now>" --next "<exact next action>"\`.\n5. Prefer \`npm run desktop-ai:run -- <command>\` for important test/build/deploy commands so exit code/log tail survives a crash.\n6. On a reproducible error: root cause -> smallest safe fix -> regression test -> checkpoint. After 2-3 failed attempts change strategy.\n7. Finish only when completion criteria and final evidence are real. Then run \`npm run desktop-ai:session:finish\`.\n`;
}

function commandInit(kind = 'init') {
  const release = acquireLock(kind);
  try {
    let s = loadState(false);
    if (!s || (s.status === 'finished' && kind === 'start')) s = defaultState();
    s.lastHeartbeatAt = nowIso();
    saveState(s, kind);
    syncWip(s);
    console.log(JSON.stringify({ pass: true, sessionId: s.sessionId, status: s.status, task: s.task }, null, 2));
  } finally { release(); }
}
function commandResume() {
  const guard = acquireReadGuard('resume');
  const release = guard.release;
  try {
    const s = loadState(true);
    const current = gitReality();
    const warnings = classifyGit(s, current);
    const inactiveMinutes = Math.max(0, Math.floor((Date.now() - new Date(s.lastActivityAt || s.updatedAt || 0).getTime()) / 60000));
    if (inactiveMinutes >= policy().staleActivityMinutes) warnings.unshift(`Previous session activity is stale (${inactiveMinutes} minute(s)); treat it as interrupted until repository reality is reconciled.`);
    if (guard.liveLock) warnings.unshift(`A previous recovery operation is still alive: pid=${guard.liveLock.pid || '?'} op=${guard.liveLock.op || 'unknown'}. Do not start a duplicate; observe/reconcile it first.`);
    if (!guard.liveLock) s.resumeCount = Number(s.resumeCount || 0) + 1;
    s.lastHeartbeatAt = nowIso();
    s.warnings = warnings;
    const scan = policy().discoverUnfinishedOnResume ? scanUnfinished(s) : { items:[], counts:{total:0,blocking:0,running:0,waiting:0} };
    persistUnfinished(s, scan);
    if (!guard.liveLock) saveState(s, 'resume', { warnings, unfinishedCounts: scan.counts });
    const packet = buildResume(s, current, warnings, scan);
    ensureDir(STATE_DIR); fs.writeFileSync(RESUME_FILE, packet, 'utf8');
    if (!guard.liveLock) syncWip(s);
    console.log(packet);
  } finally { release(); }
}
function commandHeartbeat() {
  const release = acquireLock('heartbeat');
  try {
    const s = loadState(true); s.lastHeartbeatAt = nowIso(); saveState(s, 'heartbeat');
    console.log(JSON.stringify({ pass: true, sessionId: s.sessionId, heartbeat: s.lastHeartbeatAt }, null, 2));
  } finally { release(); }
}
function commandCheckpoint(args) {
  const release = acquireLock('checkpoint');
  try {
    const s = loadState(true);
    const message = String(args.message || args._.join(' ') || 'Verified checkpoint');
    if (args.next) s.nextAction = String(args.next);
    if (args.task) s.task = String(args.task);
    const snap = snapshot(s, message);
    s.checkpoint = { at: nowIso(), message, git: snap.git, snapshot: { id: snap.id, at: snap.at } };
    s.lastHeartbeatAt = nowIso();
    saveState(s, 'checkpoint', { message, snapshotId: snap.id });
    syncWip(s);
    console.log(JSON.stringify({ pass: true, sessionId: s.sessionId, checkpoint: s.checkpoint, nextAction: s.nextAction }, null, 2));
  } finally { release(); }
}
function nextId(s) { return `step-${String(s.steps.length + 1).padStart(3, '0')}`; }
function commandStepAdd(args) {
  const release = acquireLock('step-add');
  try {
    const s = loadState(true);
    const id = String(args.id || nextId(s));
    if (s.steps.some(x => x.id === id)) throw new Error(`Step id already exists: ${id}`);
    const title = String(args.title || args._.join(' ') || '').trim();
    if (!title) throw new Error('step-add requires --title "..."');
    const step = { id, title, command: args.command ? String(args.command) : null, criteria: args.criteria ? String(args.criteria) : null, status: 'pending', createdAt: nowIso(), updatedAt: nowIso(), attempts: 0 };
    s.steps.push(step); if (!s.nextAction) s.nextAction = `${id}: ${title}`;
    saveState(s, 'step_add', { id, title }); syncWip(s);
    console.log(JSON.stringify({ pass: true, step }, null, 2));
  } finally { release(); }
}
function findStep(s, id) { const x = s.steps.find(v => v.id === id); if (!x) throw new Error(`Unknown step id: ${id}`); return x; }
function commandStepDone(args) {
  const release = acquireLock('step-done');
  try {
    const s = loadState(true); const id = String(args.id || args._[0] || ''); if (!id) throw new Error('step-done requires --id');
    const step = findStep(s, id); step.status = 'pass'; step.updatedAt = nowIso(); step.completedAt = nowIso(); step.evidence = args.evidence ? String(args.evidence) : step.evidence || null;
    const next = unresolvedStep(s); s.nextAction = next ? `${next.id}: ${next.title}` : (args.next ? String(args.next) : s.nextAction);
    s.lastError = s.lastError?.stepId === id ? null : s.lastError;
    saveState(s, 'step_done', { id, evidence: step.evidence }); syncWip(s);
    console.log(JSON.stringify({ pass: true, step, nextAction: s.nextAction }, null, 2));
  } finally { release(); }
}
function commandStepFail(args) {
  const release = acquireLock('step-fail');
  try {
    const s = loadState(true); const id = String(args.id || args._[0] || ''); if (!id) throw new Error('step-fail requires --id');
    const step = findStep(s, id); step.status = 'failed'; step.updatedAt = nowIso(); step.attempts = Number(step.attempts || 0) + 1; step.error = String(args.error || args.message || 'Unspecified failure');
    s.lastError = { at: nowIso(), stepId: id, message: step.error }; s.nextAction = `${id}: diagnose root cause; do not repeat identical failed strategy indefinitely.`;
    saveState(s, 'step_fail', { id, error: step.error }); syncWip(s);
    console.log(JSON.stringify({ pass: false, step, nextAction: s.nextAction }, null, 2));
    process.exitCode = 1;
  } finally { release(); }
}

function shellQuote(parts) {
  return parts.map(x => {
    x = String(x);
    if (/^[A-Za-z0-9_./:\\=@+,-]+$/.test(x)) return x;
    return '"' + x.replace(/"/g, '\\"') + '"';
  }).join(' ');
}
function commandRun(args) {
  const release = acquireLock('run');
  try {
    const parts = args._;
    if (!parts.length) throw new Error('run requires a command after --, for example: npm run desktop-ai:run -- npm run check');
    const s = loadState(true);
    const command = shellQuote(parts);
    const runId = `run-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    const before = snapshot(s, `before command: ${command}`);
    s.lastHeartbeatAt = nowIso();
    s.activeCommand = { runId, command, startedAt: nowIso(), checkpointSnapshotId: before.id };
    s.checkpoint = { at: nowIso(), message: `Before command: ${command}`, git: before.git, snapshot: { id: before.id, at: before.at } };
    saveState(s, 'command_start', { runId, command, snapshotId: before.id }); syncWip(s);

    const startedAt = nowIso();
    const r = spawnSync(command, { cwd: ROOT, encoding: 'utf8', shell: true, windowsHide: true, maxBuffer: 64 * 1024 * 1024, env: { ...process.env } });
    const endedAt = nowIso();
    const out = tailText(r.stdout, policy().maxCommandTailChars);
    const err = tailText(r.stderr, policy().maxCommandTailChars);
    const entry = { at: endedAt, sessionId: s.sessionId, command, startedAt, endedAt, exitCode: r.status, signal: r.signal || null, stdoutTail: out, stderrTail: err };
    appendJsonl(COMMANDS_FILE, entry);
    const after = snapshot(s, `after command: ${command} exit=${r.status}`);
    s.checkpoint = { at: nowIso(), message: `After command: ${command} exit=${r.status}`, git: after.git, snapshot: { id: after.id, at: after.at } };
    s.lastHeartbeatAt = nowIso();
    s.activeCommand = null;
    if (r.status === 0) {
      s.lastSuccessfulCommand = { at: endedAt, command, exitCode: 0 };
      if (s.lastError?.command === command) s.lastError = null;
      saveState(s, 'command_pass', { runId, command, exitCode: 0, snapshotId: after.id });
    } else {
      s.lastError = { at: endedAt, command, message: tailText(err || out || `exit ${r.status}`, 4000), exitCode: r.status };
      s.nextAction = `Diagnose root cause of failed command: ${command}; smallest safe fix; regression test; checkpoint.`;
      saveState(s, 'command_fail', { runId, command, exitCode: r.status, snapshotId: after.id });
      process.exitCode = typeof r.status === 'number' ? r.status : 1;
    }
    syncWip(s);
    if (out) process.stdout.write(out + (out.endsWith('\n') ? '' : '\n'));
    if (err) process.stderr.write(err + (err.endsWith('\n') ? '' : '\n'));
    console.log(JSON.stringify({ recoveryRecorded: true, command, exitCode: r.status, snapshotId: after.id }, null, 2));
  } finally { release(); }
}

function watchdogTaskName() { return `WorldServer-SessionWatchdog-${sha256Text(ROOT).slice(0,10)}`; }
function commandWatchdog(args={}) {
  let release;
  try { release=acquireWatchdogLock(); }
  catch(e) {
    if(e.code==='WATCHDOG_BUSY') { if(!args.quiet) console.log(JSON.stringify({pass:true, skipped:true, reason:e.message},null,2)); return; }
    throw e;
  }
  try {
    const s=loadState(false);
    const processes=readProcessTable();
    const scan=s?scanUnfinished(s):{items:[],counts:{total:0,blocking:0,running:0,waiting:0},blockerRepair:{exists:false,mergeSafe:null,nextRunAt:null}};
    const primary=primaryLockReality();
    const prev=safeJson(WATCHDOG_STATE_FILE,null);
    const c=classifySessionHealth(s,scan,processes,primary,prev);
    const health={ schemaVersion:2, engineVersion:VERSION, checkedAt:nowIso(), status:c.status, reason:c.reason,
      progressChanged:c.changed, activityMinutes:c.activityMinutes, nextTimerAt:c.nextTimerAt, timerReality:c.timers,
      hardBlockingCount:c.hardBlockingCount, hardBlockingIds:c.hardBlockingIds, primaryLock:primary,
      activeCommand:s?.activeCommand||null, commandProcessAlive:c.commandActive, unfinishedCounts:scan.counts,
      autoAgent:c.autoAgent, sessionId:s?.sessionId||null, task:s?.task||null, nextAction:s?bestNextAction(s,scan):null,
      recoveryCheckpointCreated:false, safeToStartNewChat:['STALLED','DEAD','ESCALATION_REQUIRED'].includes(c.status) };
    if(c.status==='DEAD' && s && s?.watchdog?.status!=='DEAD' && !c.commandActive && (!primary.exists || !primary.alive)) {
      try {
        const rel=acquireLock('watchdog-dead-checkpoint');
        try {
          const fresh=loadState(true);
          const snap=snapshot(fresh,'Watchdog recovery checkpoint: dead session/process detected');
          fresh.status='interrupted';
          fresh.lastError=fresh.lastError||{at:nowIso(),message:`Watchdog detected dead session/process: ${c.reason}`};
          fresh.watchdog={at:nowIso(),status:'DEAD',reason:c.reason};
          fresh.checkpoint={at:nowIso(),message:'Watchdog dead-session recovery checkpoint',git:snap.git,snapshot:{id:snap.id,at:snap.at}};
          saveState(fresh,'watchdog_dead_checkpoint',{reason:c.reason,snapshotId:snap.id}); syncWip(fresh);
          health.recoveryCheckpointCreated=true; health.recoveryCheckpointId=snap.id;
        } finally { rel(); }
      } catch(e) { health.recoveryCheckpointError=e.message; }
    }
    health.autoRecovery=performAutoRecovery(health,s,scan);
    if(health.autoRecovery?.escalation) { health.status='ESCALATION_REQUIRED'; health.reason=health.autoRecovery.reason; health.safeToStartNewChat=true; }
    else if(health.autoRecovery?.launched && health.autoRecovery.type==='auto_agent') { health.status='AUTO_RECOVERING'; health.reason=`Automatic OpenCode recovery launched pid ${health.autoRecovery.pid}`; }
    else if(health.autoRecovery?.launched && health.autoRecovery.type==='scheduler_kick') { health.status='AUTO_RECOVERING'; health.reason=`Overdue scheduler automatically kicked blockers:tick pid ${health.autoRecovery.pid}`; }
    writeJsonAtomic(HEALTH_FILE,health);
    writeJsonAtomic(WATCHDOG_STATE_FILE,{checkedAt:health.checkedAt,fingerprint:c.fingerprint,status:health.status,reason:health.reason});
    if(['STALLED','DEAD','ACTION_REQUIRED','SCHEDULER_OVERDUE','ESCALATION_REQUIRED'].includes(health.status)) writeRecoveryRequest(health);
    else { try { if(fs.existsSync(RECOVERY_REQUEST_FILE)) fs.unlinkSync(RECOVERY_REQUEST_FILE); } catch {} }
    if(!args.quiet) {
      console.log(`SESSION_STATUS = ${health.status}`);
      console.log(JSON.stringify(health,null,2));
    }
    return health;
  } finally { release(); }
}
function commandAutoRecover() { return commandWatchdog({quiet:false,forceAuto:true}); }
function commandAutoStatus() { console.log(JSON.stringify({policy:{enabled:policy().autoRecoveryEnabled,autoAgentEnabled:policy().autoAgentEnabled,autoSchedulerKickEnabled:policy().autoSchedulerKickEnabled},state:safeJson(AUTO_STATE_FILE,{}),agent:autoAgentReality(),health:safeJson(HEALTH_FILE,null)},null,2)); }
function commandWatchdogInstall() {
  ensureDir(STATE_DIR);
  const taskName=watchdogTaskName();
  if(process.platform!=='win32') {
    const r={pass:true,installed:false,platform:process.platform,taskName,reason:'Automatic Task Scheduler install is Windows-only; run npm run desktop-ai:watchdog from an external scheduler every 5 minutes.'};
    console.log(JSON.stringify(r,null,2)); return r;
  }
  const node=process.execPath;
  const cmd=`@echo off\r\ncd /d "${ROOT}"\r\n"${node}" "${path.join(ROOT,'scripts','desktop-ai-session-recovery.cjs')}" watchdog >> "${path.join(STATE_DIR,'watchdog.log')}" 2>&1\r\n`;
  fs.writeFileSync(WATCHDOG_CMD_FILE,cmd,'utf8');
  const mins=Math.max(1,Math.round(Number(policy().watchdogIntervalMinutes||5)));
  const r=spawnSync('schtasks.exe',['/Create','/F','/SC','MINUTE','/MO',String(mins),'/TN',taskName,'/TR',WATCHDOG_CMD_FILE],{encoding:'utf8',windowsHide:true});
  const out={pass:r.status===0,installed:r.status===0,platform:'win32',taskName,intervalMinutes:mins,launcher:path.relative(ROOT,WATCHDOG_CMD_FILE),stdout:tailText(r.stdout,2000),stderr:tailText(r.stderr,2000)};
  console.log(JSON.stringify(out,null,2)); if(!out.pass) process.exitCode=1; return out;
}
function commandWatchdogRemove() {
  const taskName=watchdogTaskName();
  if(process.platform!=='win32') { console.log(JSON.stringify({pass:true,removed:false,platform:process.platform,taskName},null,2)); return; }
  const r=spawnSync('schtasks.exe',['/Delete','/F','/TN',taskName],{encoding:'utf8',windowsHide:true});
  const ok=r.status===0 || /cannot find|не удается найти|не найден/i.test(String(r.stderr||r.stdout||''));
  console.log(JSON.stringify({pass:ok,removed:r.status===0,taskName,stdout:tailText(r.stdout,1000),stderr:tailText(r.stderr,1000)},null,2)); if(!ok) process.exitCode=1;
}
function commandHealth() { return commandWatchdog({quiet:false}); }

function commandStatus() {
  const guard = acquireReadGuard('status');
  const release = guard.release;
  try {
    const s = loadState(false);
    if (!s) { console.log(JSON.stringify({ installed: true, activeSession: false }, null, 2)); return; }
    const current = gitReality(); const warnings = classifyGit(s, current); const step = unresolvedStep(s); const scan = scanUnfinished(s); persistUnfinished(s, scan); const health=safeJson(HEALTH_FILE,null);
    console.log(JSON.stringify({ installed: true, engineVersion: VERSION, sessionHealth:health, activeSession: s.status !== 'finished', sessionId: s.sessionId, status: s.status, task: s.task, currentGit: current, checkpoint: s.checkpoint, unresolvedStep: step, activeCommand: s.activeCommand, unfinished: scan, lastSuccessfulCommand: s.lastSuccessfulCommand, lastError: s.lastError, nextAction: bestNextAction(s, scan), liveLock: guard.liveLock, warnings }, null, 2));
  } finally { release(); }
}

function commandUnfinished() {
  const guard = acquireReadGuard('unfinished-scan');
  const release = guard.release;
  try {
    const s = loadState(true); const scan = scanUnfinished(s); persistUnfinished(s, scan);
    if (!guard.liveLock) { saveState(s, 'unfinished_scan', { counts:scan.counts }); syncWip(s); }
    console.log(JSON.stringify(scan, null, 2));
  } finally { release(); }
}

function commandFinish(args) {
  const release = acquireLock('finish');
  try {
    const s = loadState(true); const unresolved = s.steps.filter(x => !['pass', 'skipped'].includes(x.status)); const scan = scanUnfinished(s); persistUnfinished(s, scan);
    const interrupted = scan.items.filter(x => x.source === 'interrupted-command');
    if ((unresolved.length || interrupted.length) && !args.force) throw new Error(`Cannot finish: ${unresolved.length} recovery queue step(s) and ${interrupted.length} interrupted command(s) unresolved. Resolve/verify them or explicitly use --force with documented reason.`);
    const snap = snapshot(s, 'Final session checkpoint');
    s.status = 'finished'; s.finishedAt = nowIso(); s.finishReason = args.reason ? String(args.reason) : 'Completion criteria verified by Desktop AI';
    s.checkpoint = { at: nowIso(), message: 'Session finished', git: snap.git, snapshot: { id: snap.id, at: snap.at } };
    saveState(s, 'finish', { reason: s.finishReason }); syncWip(s);
    ensureDir(HISTORY_DIR);
    const archive = path.join(HISTORY_DIR, `${s.finishedAt.replace(/[:.]/g, '-')}-${s.sessionId}.json`);
    writeJsonAtomic(archive, s);
    appendJsonl(path.join(STATE_DIR, 'history-index.jsonl'), { at: s.finishedAt, sessionId: s.sessionId, task: s.task, archive: path.relative(ROOT, archive), head: s.checkpoint.git?.head || null, branch: s.checkpoint.git?.branch || null });
    console.log(JSON.stringify({ pass: true, finished: true, sessionId: s.sessionId, archive: path.relative(ROOT, archive) }, null, 2));
  } finally { release(); }
}

function commandSelfTest() {
  const tests = [];
  function t(name, fn) { try { fn(); tests.push({ name, pass: true }); } catch (e) { tests.push({ name, pass: false, error: e.message }); } }
  t('managed block is idempotent', () => {
    const b = `${MANAGED_START}\nX\n${MANAGED_END}`; const a = managedReplace('hello\n', b); const c = managedReplace(a, b); if (a !== c) throw new Error('managed block duplicated');
  });
  t('argument parser preserves command tail', () => {
    const a = parseArgs(['--message','hello','--','npm','run','check']); if (a.message !== 'hello' || a._.join(' ') !== 'npm run check') throw new Error('parse mismatch');
  });
  t('WIP headings parser contract', () => {
    const sections = parseWipSections('# x\n## Task\nA\n## Next action\nB\n'); if (sections.task !== 'A' || sections['next action'] !== 'B') throw new Error('heading parse mismatch');
  });
  t('live pid detection', () => { if (!processAlive(process.pid)) throw new Error('current process not detected'); });
  t('sha256 deterministic', () => { if (sha256Text('a') !== sha256Text('a') || sha256Text('a') === sha256Text('b')) throw new Error('hash mismatch'); });
  t('unfinished status classifier', () => { if (!isUnfinishedStatus('requires_ai') || !isUnfinishedStatus('waiting') || isUnfinishedStatus('pass')) throw new Error('status classifier mismatch'); });
  t('optional external capability classifier', () => { if (!isOptionalExternalId('fresh-android-device') || !isOptionalExternalId('remote-cas-peer') || isOptionalExternalId('local-gates')) throw new Error('optional classifier mismatch'); });
  t('command marker extraction', () => { if (markerForCommand('node scripts/long-soak-runner.cjs run 8') !== 'long-soak-runner.cjs') throw new Error('command marker mismatch'); });
  t('watchdog waiting marker classifier', () => { if (!waitingMarkerHit('node scripts/long-soak-runner.cjs run 8 --resume')) throw new Error('long soak not recognized'); });
  t('progress fingerprint deterministic on stable state', () => { const x={sessionId:'x',status:'in_progress',steps:[]}; if(progressFingerprint(x)!==progressFingerprint(x)) throw new Error('fingerprint unstable'); });
  t('primary lock reality shape', () => { const x=primaryLockReality(); if(typeof x.exists!=='boolean'||typeof x.alive!=='boolean') throw new Error('lock reality invalid'); });
  t('watchdog task name stable', () => { if(watchdogTaskName()!==watchdogTaskName()||!watchdogTaskName().startsWith('WorldServer-SessionWatchdog-')) throw new Error('task name unstable'); });
  t('hard blocker classifier', () => { const x=hardBlockingItems({items:[{id:'a',blocking:true,status:'requires_ai'},{id:'b',blocking:false,status:'waiting'}]}); if(x.length!==1||x[0].id!=='a') throw new Error('hard blocker mismatch'); });
  t('timer overdue classifier', () => { const x=timerReality({blockerRepair:{nextRunAt:new Date(Date.now()-600000).toISOString()},items:[]}); if(!x.overdueAt||x.overdueMinutes<9) throw new Error('overdue timer not detected'); });
  t('timer future classifier', () => { const x=timerReality({blockerRepair:{nextRunAt:new Date(Date.now()+600000).toISOString()},items:[]}); if(!x.nextFutureAt||x.overdueAt) throw new Error('future timer mismatch'); });
  t('auto recovery prompt includes hard blocker', () => { const h={status:'ACTION_REQUIRED',reason:'test'}; const sc={items:[{id:'blocker:local-gates',blocking:true,status:'requires_ai',title:'local gates',action:'fix'}]}; if(!buildAutoRecoveryPrompt(h,sc).includes('local-gates')) throw new Error('prompt missing blocker'); });
  const pass = tests.every(x => x.pass);
  console.log(JSON.stringify({ pass, version: VERSION, tests, score: `${tests.filter(x=>x.pass).length}/${tests.length}` }, null, 2));
  if (!pass) process.exitCode = 1;
}

function main() {
  ensureDir(STATE_DIR);
  const cmd = process.argv[2] || 'status';
  const args = parseArgs(process.argv.slice(3));
  try {
    if (cmd === 'init' || cmd === 'start') return commandInit(cmd);
    if (cmd === 'resume') return commandResume();
    if (cmd === 'heartbeat') return commandHeartbeat();
    if (cmd === 'health') return commandHealth();
    if (cmd === 'watchdog') return commandWatchdog();
    if (cmd === 'watchdog-install') return commandWatchdogInstall();
    if (cmd === 'watchdog-remove') return commandWatchdogRemove();
    if (cmd === 'auto-recover') return commandAutoRecover();
    if (cmd === 'auto-recover-status') return commandAutoStatus();
    if (cmd === 'checkpoint') return commandCheckpoint(args);
    if (cmd === 'step-add') return commandStepAdd(args);
    if (cmd === 'step-done') return commandStepDone(args);
    if (cmd === 'step-fail') return commandStepFail(args);
    if (cmd === 'run') return commandRun(args);
    if (cmd === 'status') return commandStatus();
    if (cmd === 'unfinished' || cmd === 'scan-unfinished') return commandUnfinished();
    if (cmd === 'finish') return commandFinish(args);
    if (cmd === 'self-test') return commandSelfTest();
    throw new Error(`Unknown command: ${cmd}`);
  } catch (e) {
    console.error(`[SESSION_RECOVERY] ${e.code || 'ERROR'}: ${e.message}`);
    process.exitCode = process.exitCode || 1;
  }
}
main();
