'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

const PENDING_STATUSES = new Set(['queued', 'assigned', 'pending', 'in_progress']);

function git(cwd, args) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function normalize(value) {
  return path.resolve(String(value || '')).replace(/\\/g, '/').toLowerCase();
}

function mainCheckoutRoot(cwd) {
  const common = git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (common.status !== 0 || !common.stdout) return path.resolve(cwd);
  const normalized = path.resolve(common.stdout);
  return path.basename(normalized).toLowerCase() === '.git' ? path.dirname(normalized) : path.resolve(cwd);
}

function parseWorktrees(text) {
  const items = [];
  let current = null;
  for (const line of String(text || '').split(/\r?\n/)) {
    if (line.startsWith('worktree ')) {
      if (current) items.push(current);
      current = { path: line.slice(9), head: null, branch: null, detached: false };
    } else if (!current) {
      continue;
    } else if (line.startsWith('HEAD ')) {
      current.head = line.slice(5);
    } else if (line.startsWith('branch ')) {
      current.branch = line.slice(7).replace(/^refs\/heads\//, '');
    } else if (line === 'detached') {
      current.detached = true;
    }
  }
  if (current) items.push(current);
  return items;
}

function dirtyCount(worktreePath) {
  const status = git(worktreePath, ['status', '--porcelain']);
  if (status.status !== 0) return 0;
  return status.stdout ? status.stdout.split(/\r?\n/).filter(Boolean).length : 0;
}

function pendingReports(root, ttlHours = 24, now = Date.now()) {
  const file = path.join(root, 'state', 'ai-agent-reports.jsonl');
  if (!fs.existsSync(file)) return [];
  const cutoff = now - Number(ttlHours || 24) * 60 * 60 * 1000;
  const latest = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const at = Date.parse(row.at || row.updatedAt || row.createdAt || 0);
      if (!Number.isFinite(at) || at < cutoff) continue;
      const id = String(row.task_id || row.taskId || '');
      if (!id) continue;
      const prev = latest.get(id);
      if (!prev || at >= prev.atMs) latest.set(id, { ...row, atMs: at });
    } catch {
      // Invalid historical telemetry must not crash the admission gate.
    }
  }
  return [...latest.values()].filter((row) => PENDING_STATUSES.has(String(row.status || '').toLowerCase()));
}

function policyDefaults(policy = {}) {
  const tail = policy.tailBudget || {};
  return {
    maxActiveTails: Number(tail.maxActiveTails || 5),
    maxDirtyWorktrees: Number(tail.maxDirtyWorktrees || 2),
    maxPendingExternal: Number(tail.maxPendingExternal || 3),
    pendingTtlHours: Number(tail.pendingTtlHours || 24),
  };
}

function auditTailBudget(cwd, policy = {}, opts = {}) {
  const root = mainCheckoutRoot(cwd);
  const limits = policyDefaults(policy);
  const list = git(cwd, ['worktree', 'list', '--porcelain']);
  const worktrees = list.status === 0 ? parseWorktrees(list.stdout) : [];
  const canonical = normalize(root);
  const tails = worktrees
    .map((item) => ({ ...item, dirty: dirtyCount(item.path), canonical: normalize(item.path) === canonical }))
    .filter((item) => !item.canonical);
  const dirty = worktrees
    .map((item) => ({ ...item, dirty: dirtyCount(item.path), canonical: normalize(item.path) === canonical }))
    .filter((item) => item.dirty > 0);
  const pending = pendingReports(root, limits.pendingTtlHours, opts.now || Date.now());
  const pendingOverride = Number(process.env.WORLD_SERVER_PENDING_EXTERNAL || 0);
  const pendingCount = Math.max(pending.length, Number.isFinite(pendingOverride) ? pendingOverride : 0);
  const prospective = Math.max(0, Number(opts.prospectiveTails || 0));
  const activeTotal = tails.length + pendingCount;
  const projectedActive = activeTotal + prospective;
  const over = {
    active: projectedActive > limits.maxActiveTails,
    dirty: dirty.length > limits.maxDirtyWorktrees,
    pending: pendingCount > limits.maxPendingExternal,
  };
  const mode = opts.mode || 'development';
  const closureMode = mode === 'tail-closure';
  const blocked = !closureMode && (over.active || over.dirty || over.pending);
  return {
    ok: !blocked,
    mode,
    closureMode,
    root,
    limits,
    activeWorktreeTails: tails.length,
    dirtyWorktrees: dirty.length,
    pendingExternal: pendingCount,
    activeTotal,
    prospectiveTails: prospective,
    projectedActive,
    over,
    cycle: 'TAILS -> DEVELOPMENT -> TAILS -> DEVELOPMENT',
    action: blocked ? 'CLOSE_TAILS_FIRST' : (closureMode ? 'TAIL_CLOSURE_ALLOWED' : 'DEVELOPMENT_ALLOWED'),
    worktrees: tails.map(({ path: wtPath, branch, head, detached, dirty: dirtyFiles }) => ({ path: wtPath, branch, head, detached, dirtyFiles })),
    pendingTasks: pending.map((row) => ({ taskId: row.task_id || row.taskId, agent: row.agent || null, status: row.status, at: row.at || null })),
  };
}

module.exports = { auditTailBudget, mainCheckoutRoot, parseWorktrees, pendingReports, policyDefaults };

if (require.main === module) {
  const cwd = process.cwd();
  const root = mainCheckoutRoot(cwd);
  const policyPath = path.join(root, 'data', 'desktop-ai-policy.json');
  const policy = fs.existsSync(policyPath) ? JSON.parse(fs.readFileSync(policyPath, 'utf8')) : {};
  const modeArg = process.argv.find((arg) => arg.startsWith('--mode='));
  const mode = modeArg ? modeArg.slice('--mode='.length) : 'development';
  const prospectiveArg = process.argv.find((arg) => arg.startsWith('--prospective='));
  const prospectiveTails = prospectiveArg ? Number(prospectiveArg.slice('--prospective='.length)) : 0;
  const report = auditTailBudget(cwd, policy, { mode, prospectiveTails });
  console.log(JSON.stringify(report, null, 2));
  if (!report.ok) process.exitCode = 73;
}
