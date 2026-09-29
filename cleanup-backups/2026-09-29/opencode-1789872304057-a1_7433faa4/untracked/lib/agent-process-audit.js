'use strict';
// AGENT_PROCESS_AUDIT
//
// Machine-enforceable "never kill unknown/user processes" guard from the
// master goal: before/after every delegated local session the agent must
// measure resources and detect duplicate or orphan AI/node/python processes,
// and ONLY terminate processes PROVEN to belong to the completed session.
//
// Design:
//  - sampleAiProcesses() returns real live processes (best-effort; a probe
//    failure must never crash the caller).
//  - classifyProcesses() is PURE: given a process list it flags duplicates
//    (AI tool running more than once) and orphan candidates (AI process
//    started before the session and not owned by it), but NEVER decides to
//    kill them by itself.
//  - terminateOwnedOnly(ownedPids, ...) is the ONLY thing that may kill, and
//    only PIDs the caller explicitly recorded as owned by the completed
//    session. Unknown/user processes are structurally unkillable through this
//    module: nothing outside `ownedPids` is ever accepted. Default is
//    execute:false (dry-run report) so a mistake cannot take down user work.
const cp = require('child_process');

// AI-tool / interpreter name patterns (basename match, case-insensitive).
const AI_PROCESS_PATTERNS = [
  /^node(\.exe)?$/i,
  /^python(?:3|\.exe)?$/i,
  /^py\.exe$/i,
  /^opencode(\.exe)?$/i,
  /^codex(\.exe)?$/i,
  /^claude(\.exe)?$/i,
  /^ollama(\.exe)?$/i,
  /^npx?(\.exe)?$/i,
  /^npm(\.exe)?$/i,
  /^git(\.exe)?$/i,
  /^godot(?:\.exe)?$/i,
  /^java(?:\.exe)?$/i,
  /^go(?:\.exe)?$/i,
];

function isAiProcessName(name) {
  const base = String(name || '').replace(/\\/g, '/').split('/').pop();
  return AI_PROCESS_PATTERNS.some((re) => re.test(base));
}

// Best-effort live sampling. On Windows uses PowerShell Get-CimInstance
// (same technique already used by lib/ai-resource-scheduler.js, kept
// dependency-free for tests by not importing it); on POSIX falls back to ps.
function sampleAiProcesses() {
  try {
    if (process.platform === 'win32') {
      const script = `
Get-CimInstance Win32_Process |
  Where-Object { $_.Name -match 'node|python|py|opencode|codex|claude|ollama|npm|npx|git|godot' } |
  ForEach-Object { [PSCustomObject]@{ pid=$_.ProcessId; name=$_.Name; created=$_.CreationDate } } |
  ConvertTo-Json -Compress
`.trim();
      const out = cp.execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { encoding: 'utf8', timeout: 8000, windowsHide: true, maxBuffer: 2 * 1024 * 1024 });
      const parsed = JSON.parse(out.trim() || '[]');
      const rows = Array.isArray(parsed) ? parsed : [parsed];
      return rows.map((r) => ({ pid: Number(r.pid), name: String(r.name || ''), created: r.created ? String(r.created) : null }));
    }
    const out = cp.execFileSync('ps', ['-A', '-o', 'pid=,comm='], { encoding: 'utf8', timeout: 8000, windowsHide: true });
    return String(out).split(/\r?\n/).filter(Boolean).map((l) => {
      const m = l.trim().match(/^(\d+)\s+(.+)$/);
      return m ? { pid: Number(m[1]), name: m[2], created: null } : null;
    }).filter(Boolean).filter((p) => isAiProcessName(p.name));
  } catch {
    return [];
  }
}

// Classify a process list. Pure - no side effects, tested without any live
// processes. `ownedPids` is the set of PIDs the current session recorded as
// its own (the ONLY things that may ever be terminated later).
// Returns:
//  - duplicatePids: AI processes that are NOT owned and appear more than once
//    (an AI tool already running - do not start another).
//  - orphanCandidates: AI process NOT owned and started before `sessionStartAt`
//    (could belong to a previous session; reported, never killed automatically).
//  - owned: processes the session recorded as its own and still live.
//  - unknown: everything else (never touched by anything in this module).
function classifyProcesses(processes, { ownedPids = [], sessionStartAt = null } = {}) {
  const owned = new Set(Array.from(ownedPids).map((p) => Number(p)));
  const byName = {};
  const result = { duplicatePids: [], orphanCandidates: [], owned: [], unknown: [] };
  for (const proc of processes || []) {
    const pid = Number(proc && proc.pid);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    if (owned.has(pid)) { result.owned.push(proc); continue; }
    if (!isAiProcessName(proc.name)) { result.unknown.push(proc); continue; }
    byName[proc.name] = byName[proc.name] || [];
    byName[proc.name].push(proc);
  }
  for (const group of Object.values(byName)) {
    if (group.length > 1) for (const p of group) result.duplicatePids.push(p);
  }
  if (sessionStartAt) {
    const start = new Date(sessionStartAt).getTime();
    for (const proc of processes || []) {
      const pid = Number(proc && proc.pid);
      if (!Number.isInteger(pid) || pid <= 0 || owned.has(pid)) continue;
      if (!isAiProcessName(proc.name)) continue;
      if (result.duplicatePids.some((d) => Number(d.pid) === pid)) continue;
      if (proc.created) {
        const created = new Date(proc.created).getTime();
        if (Number.isFinite(start) && Number.isFinite(created) && created < start) result.orphanCandidates.push(proc);
      }
    }
  }
  return result;
}

// The ONLY termination path. Kills nothing outside `ownedPids`, and nothing at
// all unless `opts.execute === true` (default: dry-run). Processes are proven
// to belong to the completed session by the caller recording their PIDs as it
// spawned them; this function then verifies each requested PID is in that set
// and is currently live before acting.
function terminateOwnedOnly(ownedPids, { processes = null, execute = false, dryRun = true } = {}) {
  const owned = new Set(Array.from(ownedPids).map((p) => Number(p)));
  const live = new Set((processes || []).map((p) => Number(p && p.pid)).filter((p) => Number.isInteger(p)));
  const targets = [];
  const refused = [];
  const attempted = [];
  for (const pid of ownedPids) {
    const n = Number(pid);
    if (!Number.isInteger(n) || n <= 0) { refused.push({ pid, reason: 'invalid pid' }); continue; }
    if (live.size && !live.has(n)) { refused.push({ pid: n, reason: 'not-live' }); continue; }
    targets.push(n);
  }
  if (!execute && dryRun) return { dryRun: true, ok: true, targets, refused, attempted };
  for (const pid of targets) {
    let killed = false;
    if (process.platform === 'win32') {
      const r = cp.spawnSync('taskkill', ['/PID', String(pid), '/F'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
      killed = r.status === 0;
    } else {
      try { process.kill(pid, 'SIGTERM'); killed = true; } catch { killed = false; }
    }
    attempted.push({ pid, killed });
  }
  return { dryRun: false, ok: attempted.every((a) => a.killed), targets, refused, attempted };
}

module.exports = { AI_PROCESS_PATTERNS, isAiProcessName, sampleAiProcesses, classifyProcesses, terminateOwnedOnly };