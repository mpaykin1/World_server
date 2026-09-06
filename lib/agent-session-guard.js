'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
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

function snapshotResources(policy = loadPolicy()) {
  const pressure = resourceScheduler.systemPressure();
  const freeRamPercent = Math.round(pressure.freeRatio * 1000) / 10;
  const freeDiskBytes = diskFreeBytes(policy.aiRoot);
  const minFreeDiskGB = Number(policy.minFreeDiskGB || 5);
  return {
    freeRamPercent,
    memoryPressure: pressure.level,
    freeDiskBytes,
    freeDiskGB: freeDiskBytes == null ? null : Math.round((freeDiskBytes / 1024 ** 3) * 10) / 10,
    ramCritical: freeRamPercent < Number(policy.minFreeRamPercent || 15),
    ramWarning: freeRamPercent < Number(policy.warnFreeRamPercent || 25),
    diskCritical: freeDiskBytes != null && freeDiskBytes < minFreeDiskGB * 1024 ** 3,
  };
}

function preflight(agentId, opts = {}) {
  const policy = ensureRoots();
  const cleanup = opts.cleanup === false ? { reclaimedBytes: 0, removed: [] } : cleanupOwnedScratch(policy);
  const desktop = auditDesktop();
  const resources = snapshotResources(policy);
  const ok = desktop.ok && !resources.diskCritical;
  return { phase: 'preflight', agentId, ok, throttle: Boolean(opts.localHeavy && resources.ramCritical), desktop, resources, cleanup, roots: { worktrees: policy.worktreesRoot, scratch: policy.scratchRoot, ai: policy.aiRoot } };
}

function postflight(agentId, opts = {}) {
  const policy = ensureRoots();
  const cleanup = opts.cleanup === false ? { reclaimedBytes: 0, removed: [] } : cleanupOwnedScratch(policy);
  const desktop = auditDesktop();
  const resources = snapshotResources(policy);
  return { phase: 'postflight', agentId, ok: desktop.ok && !resources.diskCritical, desktop, resources, cleanup, roots: { worktrees: policy.worktreesRoot, scratch: policy.scratchRoot, ai: policy.aiRoot } };
}

async function withAgentSessionGuard(agentId, fn, opts = {}) {
  const pre = preflight(agentId, opts);
  if (!pre.ok) return { ok: false, result: 'ZERO_CHAOS_BLOCKED', reason: 'Desktop hygiene or disk safety gate failed', sessionGuard: { pre, post: null } };
  if (pre.throttle) return { ok: false, result: 'QUEUED', reason: 'local AI work deferred because free RAM is below the configured safety floor', sessionGuard: { pre, post: null } };
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

module.exports = { loadPolicy, ensureRoots, auditDesktop, cleanupOwnedScratch, snapshotResources, preflight, postflight, withAgentSessionGuard, coverageFor, expandEnvPath };

if (require.main === module) {
  const phase = process.argv[2] || 'preflight';
  const agentId = process.argv[3] || 'direct-desktop-ai';
  const report = phase === 'postflight' ? postflight(agentId) : preflight(agentId, { localHeavy: false });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 1;
}