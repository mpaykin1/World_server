'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');
const resourceScheduler = require('./resource-scheduler');

const POLICY_PATH = path.join(__dirname, '..', 'data', 'desktop-ai-policy.json');
const CANONICAL_DESKTOP_NAME = 'World_server';
const AI_DESKTOP_PATTERNS = [
  /^World_server_(?:copy|backup|new|fixed|final|worktree|tmp|temp|test|agent|claude|opencode|codex)/i,
  /^DELETE_MANUALLY_AFTER_AI_SESSION$/i,
  /^SESSION_SAFE_TO_DELETE$/i,
  /^WORLD_SERVER_KEEP\.zip$/i,
];

function expandEnvPath(value) {
  return String(value || '')
    .replace(/%LOCALAPPDATA%/gi, process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local'))
    .replace(/%USERPROFILE%/gi, process.env.USERPROFILE || os.homedir());
}

function loadPolicy() {
  const policy = JSON.parse(fs.readFileSync(POLICY_PATH, 'utf8'));
  const hygiene = policy.sessionHygiene || {};
  return {
    ...hygiene,
    worktreesRoot: expandEnvPath(hygiene.worktreesRoot || '%LOCALAPPDATA%\\World_server_worktrees'),
    aiRoot: expandEnvPath(hygiene.aiRoot || '%LOCALAPPDATA%\\WorldServerAI'),
    scratchRoot: expandEnvPath(hygiene.scratchRoot || '%LOCALAPPDATA%\\WorldServerAI\\Scratch'),
  };
}

function ensureRoots(policy = loadPolicy()) {
  for (const dir of [policy.worktreesRoot, policy.aiRoot, policy.scratchRoot]) fs.mkdirSync(dir, { recursive: true });
  return policy;
}

function desktopPath() {
  return path.join(process.env.USERPROFILE || os.homedir(), 'Desktop');
}

function auditDesktop(desktop = desktopPath()) {
  const violations = [];
  let entries = [];
  try { entries = fs.readdirSync(desktop, { withFileTypes: true }); } catch { return { ok: true, desktop, violations, unreadable: true }; }
  for (const entry of entries) {
    if (entry.name.toLowerCase() === CANONICAL_DESKTOP_NAME.toLowerCase()) continue;
    if (AI_DESKTOP_PATTERNS.some((re) => re.test(entry.name))) violations.push(path.join(desktop, entry.name));
  }
  return { ok: violations.length === 0, desktop, violations };
}

function diskFreeBytes(target) {
  try {
    const s = fs.statfsSync(target);
    return Number(s.bavail) * Number(s.bsize);
  } catch { return null; }
}

let _cpuProbeCache = { at: 0, value: null };

function liveCpuLoad(ttlMs) {
  if (Date.now() - _cpuProbeCache.at < Number(ttlMs || 0)) return _cpuProbeCache.value;
  let value = null;
  try {
    const { getResourceState } = require('./ai-resource-scheduler');
    const state = getResourceState();
    value = typeof state.cpuLoadPercent === 'number' && state.cpuLoadPercent >= 0 && state.cpuLoadPercent <= 100 ? state.cpuLoadPercent : null;
  } catch { value = null; }
  _cpuProbeCache = { at: Date.now(), value };
  return value;
}

function parseTasklistCsvRow(line) {
  const parts = [];
  for (const m of line.match(/"[^"]*"|[^,]+/g) || []) parts.push(m.replace(/^"|"$/g, ''));
  return parts;
}

function findAgentProcesses(opts = {}) {
  try {
    const platform = opts.platform || process.platform;
    if (platform === 'win32') {
      const out = cp.execFileSync('tasklist', ['/FO', 'CSV', '/NH'], { encoding: 'utf8', windowsHide: true, timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
      return out.trim().split(/\r?\n/).filter(Boolean).map(parseTasklistCsvRow)
        .filter((p) => /^(node|python|pythonw|codex)\.exe$/i.test(p[0] || ''))
        .map((p) => ({ pid: Number(p[1]), name: p[0] }));
    }
    const out = cp.execFileSync('ps', ['-eo', 'pid=,comm='], { encoding: 'utf8', timeout: 8000, maxBuffer: 4 * 1024 * 1024 });
    return out.trim().split(/\r?\n/).filter(Boolean).map((line) => {
      const [pid, name] = line.trim().split(/\s+/);
      return { pid: Number(pid), name };
    }).filter((p) => /^(node|nodejs|python|python3|codex)$/i.test(p.name));
  } catch {
    return [];
  }
}

function classifyProcessCensus(processes, opts = {}) {
  const currentPid = opts.currentPid || process.pid;
  const ownedPids = new Set(opts.ownedPids || []);
  const maxConcurrent = Number(opts.maxConcurrentAgentProcesses || 6);
  const census = [];
  let self = 0;
  let owned = 0;
  let agentLike = 0;
  let unknown = 0;
  const concurrentCandidates = [];
  for (const p of processes || []) {
    let kind;
    if (p.pid === currentPid) { kind = 'self'; self++; }
    else if (ownedPids.has(p.pid)) { kind = 'owned'; owned++; }
    else if (/^(node|python|codex)/i.test(String(p.name || ''))) { kind = 'agent-like'; agentLike++; if (agentLike > maxConcurrent) concurrentCandidates.push({ pid: p.pid, name: p.name }); }
    else { kind = 'unknown'; unknown++; }
    census.push({ ...p, kind });
  }
  return { total: census.length, self, owned, agentLike, unknown, concurrentCandidates, census };
}

function collectProcessCensus(policy, opts = {}) {
  if (!policy.processCensusEnabled || opts.processCensus === false) return { enabled: false, summary: null, rawCount: 0 };
  const raw = findAgentProcesses(opts);
  return { enabled: true, rawCount: raw.length, summary: classifyProcessCensus(raw, { currentPid: opts.currentPid, ownedPids: opts.ownedPids, maxConcurrentAgentProcesses: policy.maxConcurrentAgentProcesses }) };
}

function cleanupOwnedScratch(policy = loadPolicy(), now = Date.now()) {
  const root = policy.scratchRoot;
  const ttlMs = Number(policy.scratchTtlHours || 24) * 60 * 60 * 1000;
  const allowed = /^(?:agent-|health-probe-|session-guard-)/i;
  let reclaimedBytes = 0;
  const removed = [];
  let entries = [];
  try { entries = fs.readdirSync(root, { withFileTypes: true }); } catch { return { reclaimedBytes, removed }; }
  for (const entry of entries) {
    if (!entry.isFile() || !allowed.test(entry.name)) continue;
    const full = path.join(root, entry.name);
    try {
      const st = fs.statSync(full);
      if (now - st.mtimeMs < ttlMs) continue;
      fs.unlinkSync(full);
      reclaimedBytes += st.size;
      removed.push(full);
    } catch { /* best effort; never broaden deletion */ }
  }
  return { reclaimedBytes, removed };
}

function snapshotResources(policy = loadPolicy(), opts = {}) {
  const pressure = resourceScheduler.systemPressure();
  const freeRamPercent = opts.resources && typeof opts.resources.freeRamPercent === 'number' ? opts.resources.freeRamPercent : Math.round(pressure.freeRatio * 1000) / 10;
  const memoryPressure = opts.resources && typeof opts.resources.memoryPressure === 'string' ? opts.resources.memoryPressure : pressure.level;
  const freeDiskBytes = diskFreeBytes(policy.aiRoot);
  const minFreeDiskGB = Number(policy.minFreeDiskGB || 5);
  const cpuLoadPercent = opts.resources && typeof opts.resources.cpuLoadPercent === 'number' ? opts.resources.cpuLoadPercent : liveCpuLoad(policy.resourceProbeTtlMs || 2000);
  const cpuLimit = Number(policy.cpuLoadPercentMax || 80);
  return {
    freeRamPercent,
    memoryPressure,
    freeDiskBytes,
    freeDiskGB: freeDiskBytes == null ? null : Math.round((freeDiskBytes / 1024 ** 3) * 10) / 10,
    ramCritical: freeRamPercent < Number(policy.minFreeRamPercent || 15),
    ramWarning: freeRamPercent < Number(policy.warnFreeRamPercent || 25),
    diskCritical: freeDiskBytes != null && freeDiskBytes < minFreeDiskGB * 1024 ** 3,
    cpuLoadPercent,
    cpuLimit,
    cpuHigh: cpuLoadPercent != null && cpuLoadPercent >= cpuLimit,
  };
}

function preflight(agentId, opts = {}) {
  const policy = ensureRoots();
  const cleanup = opts.cleanup === false ? { reclaimedBytes: 0, removed: [] } : cleanupOwnedScratch(policy);
  const desktop = auditDesktop();
  const resources = snapshotResources(policy, opts);
  const processes = collectProcessCensus(policy, opts);
  const throttle = Boolean(opts.localHeavy && (resources.ramCritical || resources.ramWarning || resources.cpuHigh || resources.diskCritical));
  const ok = desktop.ok && !resources.diskCritical;
  return { phase: 'preflight', agentId, ok, throttle, desktop, resources, processes, cleanup, roots: { worktrees: policy.worktreesRoot, scratch: policy.scratchRoot, ai: policy.aiRoot } };
}

function postflight(agentId, opts = {}) {
  const policy = ensureRoots();
  const cleanup = opts.cleanup === false ? { reclaimedBytes: 0, removed: [] } : cleanupOwnedScratch(policy);
  const desktop = auditDesktop();
  const resources = snapshotResources(policy, opts);
  const processes = collectProcessCensus(policy, opts);
  return { phase: 'postflight', agentId, ok: desktop.ok && !resources.diskCritical, desktop, resources, processes, cleanup, roots: { worktrees: policy.worktreesRoot, scratch: policy.scratchRoot, ai: policy.aiRoot } };
}

async function withAgentSessionGuard(agentId, fn, opts = {}) {
  const pre = preflight(agentId, opts);
  if (!pre.ok) return { ok: false, result: 'ZERO_CHAOS_BLOCKED', reason: 'Desktop hygiene or disk safety gate failed', sessionGuard: { pre, post: null } };
  if (pre.throttle) return { ok: false, result: 'QUEUED', reason: 'local AI work deferred because CPU load, free RAM or disk pressure is above the configured safety floor', sessionGuard: { pre, post: null } };
  let value;
  let thrown;
  try { value = await fn(); } catch (err) { thrown = err; }
  const post = postflight(agentId, opts);
  if (thrown) {
    thrown.sessionGuard = { pre, post };
    throw thrown;
  }
  const base = value && typeof value === 'object' ? value : { value };
  if (!post.ok) return { ...base, ok: false, result: base.result === 'PASS' ? 'ZERO_CHAOS_POSTFAIL' : (base.result || 'ZERO_CHAOS_POSTFAIL'), sessionGuard: { pre, post } };
  return { ...base, sessionGuard: { pre, post } };
}

function coverageFor(agentIds) {
  return [...new Set(agentIds)].sort().map((agentId) => ({ agentId, preflight: true, postflight: true, inherited: true }));
}

module.exports = { loadPolicy, ensureRoots, auditDesktop, cleanupOwnedScratch, snapshotResources, preflight, postflight, withAgentSessionGuard, coverageFor, expandEnvPath, liveCpuLoad, findAgentProcesses, classifyProcessCensus, collectProcessCensus };

if (require.main === module) {
  const phase = process.argv[2] || 'preflight';
  const agentId = process.argv[3] || 'direct-desktop-ai';
  const report = phase === 'postflight' ? postflight(agentId) : preflight(agentId, { localHeavy: false });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}