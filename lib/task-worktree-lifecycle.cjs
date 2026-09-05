'use strict';
/**
 * scripts/lib/task-worktree-lifecycle.cjs
 *
 * Root-cause fix for the browser-local worktree leak: `browser-local-worker.cjs`
 * and `browser-local-worker-live.cjs` both call `ensureTaskWorktree()` (git
 * worktree add) once per task, but neither ever released the worktree
 * afterward — that is the entire reason state/browser-local-worktrees/ grew
 * to ~135+ entries. This module is the ONE shared lifecycle both workers call
 * from a try/finally around task execution, instead of two divergent
 * cleanup implementations.
 *
 * Design constraints (from the WORLD_SERVER ZERO-JUNK policy, AGENTS.md §18):
 *   - Never remove a worktree with uncommitted changes.
 *   - Never delete the task's branch (browser-task/<task_id>) — only the
 *     worktree checkout. The branch is the permanent, always-reachable
 *     record of whatever the task committed; `git worktree remove` never
 *     touches refs, only the working directory + admin entry.
 *   - TTL/lease metadata is an ADDITIONAL signal, never the sole basis for
 *     removal — a worktree is only ever removed because it is clean AND its
 *     owning task reached a terminal state, never because it "looks old".
 *   - Two workers racing to release the same task worktree must not both
 *     proceed (mkdir is atomic on every platform we run on).
 */

const fs = require('fs');
const path = require('path');
const cp = require('child_process');

function git(cwd, args, timeoutMs = 30000) {
  const r = cp.spawnSync('git', args, { cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true });
  return { status: r.status, stdout: String(r.stdout || ''), stderr: String(r.stderr || '') };
}

function ensureDir(p) { fs.mkdirSync(p, { recursive: true }); }

function writeJsonAtomic(p, obj) {
  ensureDir(path.dirname(p));
  const tmp = `${p}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, p);
}

function leasePath(worktreesDir, taskId) { return path.join(worktreesDir, `${taskId}.lease.json`); }

/** Record/refresh a lease. Additional signal only — never the deletion trigger. */
function touchLease(worktreesDir, taskId, { owner, ttlMs = 30 * 60000 } = {}) {
  const p = leasePath(worktreesDir, taskId);
  const now = new Date().toISOString();
  let lease = null;
  try { lease = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  lease = lease || { taskId, createdAt: now };
  lease.owner = owner || lease.owner || null;
  lease.pid = process.pid;
  lease.lastUsedAt = now;
  lease.ttlMs = ttlMs;
  writeJsonAtomic(p, lease);
  return lease;
}

function removeLease(worktreesDir, taskId) {
  try { fs.unlinkSync(leasePath(worktreesDir, taskId)); } catch {}
}

function readLease(worktreesDir, taskId) {
  try { return JSON.parse(fs.readFileSync(leasePath(worktreesDir, taskId), 'utf8')); } catch { return null; }
}

/** Atomic cross-process mutual exclusion for the release step (mkdir is atomic). */
function withReleaseLock(wtPath, fn) {
  const lockDir = `${wtPath}.release.lock`;
  try { fs.mkdirSync(lockDir); } catch (e) {
    if (e && e.code === 'EEXIST') return { released: false, reason: 'busy' };
    throw e;
  }
  try { return fn(); } finally { try { fs.rmdirSync(lockDir); } catch {} }
}

/**
 * Release (git worktree remove) a task's isolated worktree, iff it is
 * provably safe: exists, is not locked by a concurrent release, and has no
 * uncommitted changes. Never removes the backing branch.
 */
function releaseTaskWorktree(mainRoot, worktreesDir, taskId) {
  const wtPath = path.join(worktreesDir, taskId);
  if (!fs.existsSync(wtPath)) { removeLease(worktreesDir, taskId); return { released: false, reason: 'not_found' }; }
  return withReleaseLock(wtPath, () => {
    // re-check existence inside the lock: another process may have removed it
    // between our first check and acquiring the lock.
    if (!fs.existsSync(wtPath)) { removeLease(worktreesDir, taskId); return { released: false, reason: 'not_found' }; }
    const status = git(wtPath, ['status', '--porcelain', '--untracked-files=normal']);
    if (status.status !== 0) return { released: false, reason: 'status_failed', detail: status.stderr };
    if (status.stdout.trim() !== '') {
      return { released: false, reason: 'dirty', statusLines: status.stdout.trim().split('\n').slice(0, 20) };
    }
    const rm = git(mainRoot, ['worktree', 'remove', wtPath]);
    if (rm.status !== 0) return { released: false, reason: 'remove_failed', detail: rm.stderr || rm.stdout };
    git(mainRoot, ['worktree', 'prune']);
    removeLease(worktreesDir, taskId);
    return { released: true, path: wtPath };
  });
}

/**
 * Startup-recovery sweep: run once when a worker process (re)starts, to
 * reclaim worktrees whose owning task already finished (completed/failed)
 * before a prior process crashed/restarted without releasing them. A
 * worktree with no discoverable task record, or whose task is still
 * queued/running, is reported but never touched — "unknown" is not "safe".
 */
function sweepOrphanedTaskWorktrees(mainRoot, worktreesDir, queueDir, resultsDir) {
  const report = { checkedAt: new Date().toISOString(), released: [], skipped: [] };
  if (!fs.existsSync(worktreesDir)) return report;
  const entries = fs.readdirSync(worktreesDir, { withFileTypes: true }).filter(e => e.isDirectory());
  for (const e of entries) {
    const taskId = e.name;
    let taskRecord = null;
    for (const dir of [resultsDir, queueDir]) {
      const p = path.join(dir, `${taskId}.json`);
      if (fs.existsSync(p)) { try { taskRecord = JSON.parse(fs.readFileSync(p, 'utf8')); } catch {} if (taskRecord) break; }
    }
    if (!taskRecord) { report.skipped.push({ taskId, reason: 'no_task_record' }); continue; }
    if (!['completed', 'failed'].includes(taskRecord.status)) { report.skipped.push({ taskId, reason: `status_${taskRecord.status}` }); continue; }
    const result = releaseTaskWorktree(mainRoot, worktreesDir, taskId);
    if (result.released) report.released.push({ taskId, path: path.join(worktreesDir, taskId) });
    else report.skipped.push({ taskId, reason: result.reason });
  }
  return report;
}

module.exports = { touchLease, removeLease, readLease, leasePath, releaseTaskWorktree, sweepOrphanedTaskWorktrees };
