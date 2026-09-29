'use strict';
// PC_HEALTH_GUARD - focused implementation slice of the master
// PC-HEALTH / ZERO-CHAOS goal, layered on top of the existing shared
// session guard (lib/agent-session-guard.js). It adds what the master
// directive requires and the old guard could not measure:
//
//   - real CPU measurement (os.loadavg() is a documented no-op on Windows,
//     so Windows reads the OS's own Win32_Processor LoadPercentage and only
//     falls back to a brief os.cpus() delta sample);
//   - a strictly READ-ONLY process survey + duplicate/orphan/heavy-job
//     classification: this module structurally contains no process-kill
//     call (a regression test asserts that), termination of owned
//     subprocesses remains exclusively the launcher's job
//     (runWithTreeKill in lib/agent-adapters.js);
//   - one combined health snapshot (CPU / free RAM / free disk / processes);
//   - policy evaluation returning explicit allow / deferHeavy / hardBlock
//     decisions with human-readable reasons;
//   - an append-only JSONL health ledger under the existing off-Desktop
//     aiRoot (never Desktop), with retention pruning, before/after session
//     comparison and daily per-agent usage enforcing the "Codex <= 30% of
//     daily AI-agent work" and "never paid" gates.
//
// Pure helpers take injected values so the logic is deterministically
// testable; the collectors are the only parts that touch the OS.
const os = require('os');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const DAY_MS = 24 * 60 * 60 * 1000;
const CODECO_AGENT_ID = 'codex';

function clamp(value, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, value));
}

function expandEnvPath(value) {
  return String(value || '')
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || os.homedir());
}

function normalizePolicy(policy = {}) {
  const hyg = (policy.sessionHygiene && typeof policy.sessionHygiene === 'object') ? policy.sessionHygiene : policy;
  return {
    aiRoot: expandEnvPath(hyg.aiRoot || '%LOCALAPPDATA%\\WorldServerAI'),
    healthLedgerSubdir: hyg.healthLedgerSubdir || 'HealthLedger',
    maxCpuPercent: Number(hyg.maxCpuPercent || 80),
    hardMaxCpuPercent: Number(hyg.hardMaxCpuPercent || 95),
    minFreeRamPercent: Number(hyg.minFreeRamPercent || 15),
    warnFreeRamPercent: Number(hyg.warnFreeRamPercent || 25),
    minFreeDiskGB: Number(hyg.minFreeDiskGB || 5),
    maxDuplicateAgentProcesses: Number(hyg.maxDuplicateAgentProcesses || 2),
    maxConcurrentComputeHeavyJobs: Number(hyg.maxConcurrentComputeHeavyJobs || 1),
    codexMaxDailySharePercent: Number(hyg.codexMaxDailySharePercent || 30),
    allowPaidWork: Boolean(hyg.allowPaidWork),
    healthLedgerRetentionMs: Number(hyg.healthLedgerRetentionDays || 7) * DAY_MS,
  };
}

function winCpuLoadPercentage(timeoutMs = 4000) {
  const r = spawnSync(
    'powershell',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command',
      '(Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average'],
    { encoding: 'utf8', timeout: timeoutMs, windowsHide: true }
  );
  if (r.status !== 0) return null;
  const v = Number.parseFloat(String(r.stdout || '').replace(/,/g, '.'));
  return Number.isFinite(v) ? clamp(Math.round(v * 10) / 10) : null;
}

function sampleCpuPercent(sampleMs = 150) {
  if (!Number.isFinite(sampleMs) || sampleMs <= 0) return null;
  const totals = new Map();
  for (const c of os.cpus()) totals.set(c.model + ':' + c.speed, { idle0: c.times.idle, used0: Object.values(c.times).reduce((a, b) => a + b, 0) - c.times.idle });
  const until = Date.now() + sampleMs;
  while (Date.now() < until) { /* deliberately short, bounded window */ }
  let usedDelta = 0;
  let totalDelta = 0;
  for (const c of os.cpus()) {
    const key = c.model + ':' + c.speed;
    const before = totals.get(key);
    if (!before) continue;
    const used1 = Object.values(c.times).reduce((a, b) => a + b, 0) - c.times.idle;
    usedDelta += Math.max(0, used1 - before.used0);
    totalDelta += Math.max(0, (used1 + c.times.idle) - (before.used0 + before.idle0));
  }
  if (totalDelta <= 0) return null;
  return clamp(Math.round((usedDelta / totalDelta) * 1000) / 10);
}

function cpuPercent(options = {}) {
  if (options.injectedValue != null) return clamp(Number(options.injectedValue));
  if (process.platform === 'win32' && !options.forceSampling) {
    const osValue = winCpuLoadPercentage();
    if (osValue != null) return osValue;
  } else if (process.platform !== 'win32') {
    try {
      const load = os.loadavg()[0];
      if (Number.isFinite(load)) return clamp(Math.round((load / Math.max(1, os.cpus().length)) * 1000) / 10);
    } catch { /* fall through to sampling */ }
  }
  return sampleCpuPercent(options.sampleMs);
}

function freeRamPercent(value) {
  const total = os.totalmem();
  const free = os.freemem();
  if (total <= 0) return null;
  return clamp(Math.round((free / total) * 1000) / 10);
}

function freeDiskGB(aiRoot) {
  try {
    const target = aiRoot || os.homedir();
    const s = fs.statfsSync(target);
    const bytes = Number(s.bavail) * Number(s.bsize);
    return Math.round((bytes / 1024 ** 3) * 10) / 10;
  } catch { return null; }
}

// ---- READ-ONLY process survey (collectors) ----
function processSurvey(timeoutMs = 8000) {
  const procs = [];
  if (process.platform === 'win32') {
    const ps = 'Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine | ConvertTo-Json -Compress -Depth 2';
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { encoding: 'utf8', timeout: timeoutMs, windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) return { collected: false, error: `powershell exit ${r.status}: ${String(r.stderr || '').slice(0, 200)}`, procs: [] };
    let data;
    try { data = JSON.parse(r.stdout); } catch { return { collected: false, error: 'powershell process survey output was not valid JSON', procs: [] }; }
    const list = Array.isArray(data) ? data : (data ? [data] : []);
    for (const item of list) {
      procs.push({
        pid: Number(item.ProcessId) || 0,
        ppid: Number(item.ParentProcessId) || 0,
        name: String(item.Name || item.ProcessId || ''),
        cmd: String(item.CommandLine || ''),
      });
    }
  } else {
    const r = spawnSync('ps', ['-eo', 'pid=,ppid=,comm=,args='], { encoding: 'utf8', timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024 });
    if (r.status !== 0) return { collected: false, error: `ps exit ${r.status}`, procs: [] };
    for (const line of String(r.stdout || '').split(/\r?\n/)) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
      if (m) procs.push({ pid: Number(m[1]), ppid: Number(m[2]), name: m[3], cmd: `${m[3]} ${m[4]}`.trim() });
    }
  }
  return { collected: true, error: null, procs };
}

const FAMILY_PATTERNS = [
  { family: 'aiAgent', re: /\b(codex|opencode|claude|claude-code|master-coordinator|anythingllm|collective-brain|openhuman|jules)\b/i },
  { family: 'nodeServer', re: /\bnode(?:\.exe)?\b.*\bserver\.js\b/i },
  { family: 'pythonHttp', re: /\bpython(?:\.exe)?\b.*\s-m\s+http\.server\b/i },
  { family: 'nodeRuntime', re: /\bnode(?:\.exe)?\b/i },
  { family: 'pythonRuntime', re: /\bpython(?:\.exe)?\b/i },
  { family: 'heavyCompute', re: /\b(godot|godot-native-build|build:native|npm (?:ci|install|run build)|release:gate|worldgen|performance-benchmark|ollama)\b/i },
];

function familyOf(proc) {
  for (const { family, re } of FAMILY_PATTERNS) if (re.test(String(proc.cmd))) return family;
  return 'other';
}

// Singleton-role families - more than one alive instance of the SAME
// normalized command is treated as a duplication signal (e.g. two
// `node server.js` or two `python -m http.server` processes), not proof.
const SINGLETON_FAMILIES = new Set(['aiAgent', 'nodeServer', 'pythonHttp']);

function normalizeCommand(cmd) {
  return String(cmd || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/--?(?:port|p)\s+\d+/g, ' ')
    .trim();
}

// Pure classification over an injected process list (read-only, no I/O).
function classifyProcesses(procs = []) {
  const families = {};
  const groups = new Map();
  for (const proc of procs) {
    if (!proc || !proc.pid) continue;
    const family = familyOf(proc);
    families[family] = (families[family] || 0) + 1;
    if (SINGLETON_FAMILIES.has(family)) {
      const key = `${family}::${normalizeCommand(proc.cmd)}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(proc.pid);
    }
  }
  const pidSet = new Set(procs.map((p) => Number(p.pid)).filter((n) => n > 0));
  const duplicateGroups = [];
  for (const [key, pids] of groups) {
    if (pids.length > 1) duplicateGroups.push({ key, count: pids.length, pids: [...pids] });
  }
  const agentDuplicateGroups = duplicateGroups.filter((g) => g.key.startsWith('aiAgent::'));
  const serviceDuplicateGroups = duplicateGroups.filter((g) => g.key.startsWith('nodeServer::') || g.key.startsWith('pythonHttp::'));
  const orphans = [];
  for (const proc of procs) {
    const pid = Number(proc.pid);
    const ppid = Number(proc.ppid);
    if (!pid || ppid === 0) continue;
    const family = familyOf(proc);
    if (family === 'other' || family === 'heavyCompute') continue;
    if (!pidSet.has(ppid)) orphans.push({ pid, ppid, family, name: proc.name, cmd: (proc.cmd || '').slice(0, 160) });
  }
  return {
    collectedCount: procs.length,
    families,
    duplicateGroups,
    agentDuplicates: agentDuplicateGroups.reduce((a, g) => a + g.count, 0),
    agentDuplicateGroupCount: agentDuplicateGroups.length,
    serviceDuplicates: serviceDuplicateGroups.reduce((a, g) => a + g.count, 0),
    duplicatesTotal: duplicateGroups.reduce((a, g) => a + g.count, 0),
    orphans,
    orphanCount: orphans.length,
    heavyComputeJobs: Number(families.heavyCompute || 0),
  };
}

function processStatus(policy, timeoutMs = 8000) {
  const survey = processSurvey(timeoutMs);
  if (!survey.collected) {
    return { collected: false, error: survey.error, count: 0, agentDuplicates: 0, agentDuplicateGroupCount: 0, serviceDuplicates: 0, duplicatesTotal: 0, orphanCount: 0, heavyComputeJobs: 0 };
  }
  const classified = classifyProcesses(survey.procs);
  return {
    collected: true,
    error: null,
    count: survey.procs.length,
    agentDuplicates: classified.agentDuplicates,
    agentDuplicateGroupCount: classified.agentDuplicateGroupCount,
    serviceDuplicates: classified.serviceDuplicates,
    duplicatesTotal: classified.duplicatesTotal,
    duplicateGroups: classified.duplicateGroups,
    orphanCount: classified.orphanCount,
    orphans: classified.orphans.slice(0, 10),
    heavyComputeJobs: classified.heavyComputeJobs,
  };
}

// ---- combined snapshot + decision ----
function healthSnapshot(policy = {}, options = {}) {
  const normalized = normalizePolicy(policy);
  const cpu = options.cpuPercent != null ? clamp(Number(options.cpuPercent)) : cpuPercent();
  const ram = options.freeRamPercent != null ? clamp(Number(options.freeRamPercent)) : freeRamPercent();
  const disk = options.freeDiskGB != null ? Number(options.freeDiskGB) : freeDiskGB(normalized.aiRoot);
  const processes = options.processes != null
    ? options.processes
    : processStatus(normalized, options.processSurveyTimeoutMs);
  return {
    at: new Date().toISOString(),
    cpuPercent: cpu,
    freeRamPercent: ram,
    freeDiskGB: disk,
    processes,
  };
}

function evaluate(snapshot, policy = {}, opts = {}) {
  const p = normalizePolicy(policy);
  const reasons = [];
  let cpuPressure = 'low';
  let memoryPressure = 'low';
  let hardBlock = false;

  if (snapshot.cpuPercent != null) {
    if (snapshot.cpuPercent >= p.hardMaxCpuPercent) { cpuPressure = 'hard'; hardBlock = true; reasons.push({ level: 'block', code: 'CPU_HARD_PRESSURE', message: `CPU ${snapshot.cpuPercent}% >= hard cap ${p.hardMaxCpuPercent}% - do not start local heavy AI work` }); }
    else if (snapshot.cpuPercent >= p.maxCpuPercent) { cpuPressure = 'high'; reasons.push({ level: 'defer', code: 'CPU_HIGH_PRESSURE', message: `CPU ${snapshot.cpuPercent}% >= ${p.maxCpuPercent}% - defer heavy local AI work to a free cloud agent` }); }
  }
  if (snapshot.freeRamPercent != null) {
    if (snapshot.freeRamPercent < p.minFreeRamPercent) { memoryPressure = 'high'; hardBlock = true; reasons.push({ level: 'block', code: 'RAM_CRITICAL', message: `free RAM ${snapshot.freeRamPercent}% < ${p.minFreeRamPercent}% - stop/defer local heavy AI work` }); }
    else if (snapshot.freeRamPercent < p.warnFreeRamPercent) { memoryPressure = 'moderate'; reasons.push({ level: 'defer', code: 'RAM_LOW', message: `free RAM ${snapshot.freeRamPercent}% < ${p.warnFreeRamPercent}% - reroute heavy local work` }); }
  }
  if (snapshot.freeDiskGB != null && snapshot.freeDiskGB < p.minFreeDiskGB) {
    hardBlock = true;
    reasons.push({ level: 'block', code: 'DISK_CRITICAL', message: `free disk ${snapshot.freeDiskGB}GB < ${p.minFreeDiskGB}GB` });
  }
  if (opts.desktopOk === false) {
    hardBlock = true;
    reasons.push({ level: 'block', code: 'DESKTOP_HYGIENE_VIOLATION', message: 'Desktop hygiene audit found AI clutter' });
  }
  const proc = snapshot.processes;
  if (proc) {
    if (!proc.collected) reasons.push({ level: 'info', code: 'PROCESS_SURVEY_UNAVAILABLE', message: `process survey unavailable: ${proc.error || 'unknown'}` });
    if (proc.agentDuplicates > p.maxDuplicateAgentProcesses) {
      hardBlock = true;
      reasons.push({ level: 'block', code: 'DUPLICATE_AGENT_PROCESSES', message: `${proc.agentDuplicates} agent processes found, cap is ${p.maxDuplicateAgentProcesses}` });
    }
    if (proc.collected && proc.heavyComputeJobs > p.maxConcurrentComputeHeavyJobs) {
      hardBlock = true;
      reasons.push({ level: 'block', code: 'TOO_MANY_COMPUTE_HEAVY_JOBS', message: `${proc.heavyComputeJobs} compute-heavy local jobs, maximum allowed is ${p.maxConcurrentComputeHeavyJobs}` });
    }
  }
  const defer = reasons.some((r) => r.level === 'defer');
  return {
    allow: !hardBlock,
    hardBlock,
    deferHeavy: defer,
    cpuPressure,
    memoryPressure,
    reasons,
  };
}

// ---- health ledger (off-Desktop JSONL) ----
function ledgerFile(policy) {
  const p = normalizePolicy(policy);
  return path.join(p.aiRoot, p.healthLedgerSubdir, 'pc-health.jsonl');
}

function recordHealth({ agentId, sessionId, phase, snapshot, decision, cleanup, paid }, policy) {
  const p = normalizePolicy(policy);
  const file = ledgerFile(p);
  const at = new Date().toISOString();
  const entry = {
    at,
    ts: Date.now(),
    sessionId: sessionId || `${agentId || 'unknown'}:${Date.now()}`,
    agentId: agentId || 'unknown',
    phase: phase || 'snapshot',
    snapshot: snapshot || {},
    decision: decision || { allow: true, hardBlock: false, deferHeavy: false, reasons: [] },
    cleanup: cleanup || {},
    paid: Boolean(paid),
  };
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  } catch { /* ledger is best-effort, never blocks a session */ }
  pruneLedger(policy);
  return { entry, file };
}

function pruneLedger(policy) {
  const p = normalizePolicy(policy);
  const file = ledgerFile(p);
  if (!fs.existsSync(file)) return;
  try {
    const now = Date.now();
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
    const kept = lines.filter((l) => {
      try { return Number(JSON.parse(l).ts || 0) >= now - p.healthLedgerRetentionMs; } catch { return false; }
    });
    if (kept.length !== lines.length) fs.writeFileSync(file, kept.join('\n') + (kept.length ? '\n' : ''), 'utf8');
  } catch { /* best-effort retention */ }
}

function readLedger(policy, { sinceMs = 0, limit = 5000 } = {}) {
  const file = ledgerFile(policy);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean);
  const out = [];
  for (const line of lines) {
    try {
      const entry = JSON.parse(line);
      if (Number(entry.ts || 0) >= sinceMs) out.push(entry);
    } catch { /* skip corrupt line */ }
  }
  return limit > 0 ? out.slice(-limit) : out;
}

// ---- daily agent-work policy (Codex <= 30% fallback cap, never paid) ----
function dailyAgentUsage(entries, { now = Date.now(), lookbackMs = DAY_MS } = {}) {
  const span = entries.filter((e) => Number(e.ts || 0) >= now - lookbackMs && e.phase === 'preflight');
  const counts = {};
  for (const e of span) if (e.agentId) counts[e.agentId] = (counts[e.agentId] || 0) + 1;
  const total = Object.keys(counts).reduce((a, k) => a + counts[k], 0);
  const codexCount = counts[CODECO_AGENT_ID] || 0;
  const codexSharePercent = total > 0 ? Math.round((codexCount / total) * 1000) / 10 : 0;
  const paidSessions = span.filter((e) => e.paid).length;
  return { total, counts, codexCount, codexSharePercent, paidSessions };
}

function enforceAgentWorkPolicy(entries, policy, opts = {}) {
  const p = normalizePolicy(policy);
  const usage = dailyAgentUsage(entries, opts);
  const violations = [];
  if (usage.codexSharePercent > p.codexMaxDailySharePercent) {
    violations.push({
      code: 'CODEX_SHARE_EXCEEDED',
      message: `codex is ${usage.codexSharePercent}% of ${usage.total} daily agent sessions, above the ${p.codexMaxDailySharePercent}% fallback-only cap`,
    });
  }
  if (usage.paidSessions > 0 && !p.allowPaidWork) {
    violations.push({ code: 'PAID_WORK_BLOCKED', message: `${usage.paidSessions} sessions recorded paid work while allowPaidWork is disabled` });
  }
  return { usage, ok: violations.length === 0, violations };
}

// Before/after comparison: PC health after the session must be no worse
// than before. Tolerances absorb real measurement variance; CPU deltas are
// informational only (a warm session legitimately raises transient CPU,
// which is not a health regression by itself).
function compareSessionHealth(preEntry, postEntry, opts = {}) {
  const regressRamPct = Number(opts.regressRamPct || 5);
  const regressDiskGB = Number(opts.regressDiskGB || 1);
  const regressions = [];
  if (!preEntry || !postEntry) return { ok: true, compared: false, regressions: [] };
  const pre = preEntry.snapshot || {};
  const post = postEntry.snapshot || {};
  if (pre.freeRamPercent != null && post.freeRamPercent != null && post.freeRamPercent - pre.freeRamPercent < -regressRamPct) {
    regressions.push({ metric: 'freeRamPercent', before: pre.freeRamPercent, after: post.freeRamPercent });
  }
  if (pre.freeDiskGB != null && post.freeDiskGB != null && post.freeDiskGB - pre.freeDiskGB < -regressDiskGB) {
    regressions.push({ metric: 'freeDiskGB', before: pre.freeDiskGB, after: post.freeDiskGB });
  }
  let cpuNote = null;
  if (pre.cpuPercent != null && post.cpuPercent != null && post.cpuPercent - pre.cpuPercent > 40) {
    cpuNote = { metric: 'cpuPercent', before: pre.cpuPercent, after: post.cpuPercent, soft: true };
  }
  return { ok: regressions.length === 0, compared: true, regressions, cpuNote };
}

module.exports = {
  normalizePolicy, expandEnvPath, cpuPercent, sampleCpuPercent, winCpuLoadPercentage,
  freeRamPercent, freeDiskGB, processSurvey, classifyProcesses, familyOf,
  processStatus, healthSnapshot, evaluate, recordHealth, pruneLedger, readLedger,
  dailyAgentUsage, enforceAgentWorkPolicy, compareSessionHealth, ledgerFile,
};

if (require.main === module) {
  const record = process.argv.includes('--record');
  const sessionGuard = require('./agent-session-guard');
  const policy = sessionGuard.loadPolicy();
  const snapshot = healthSnapshot(policy);
  const decision = evaluate(snapshot, policy);
  const report = { snapshot, decision };
  if (record) {
    const health = recordHealth({ agentId: 'pc-health-cli', sessionId: `pc-health:${Date.now()}`, phase: 'snapshot', snapshot, decision }, policy);
    report.ledger = health.file;
  }
  console.log(JSON.stringify(report, null, 2));
  if (decision.hardBlock) process.exitCode = 1;
}