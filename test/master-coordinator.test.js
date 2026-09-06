'use strict';
// Regression tests for scripts/master-coordinator.cjs. Live subprocess
// dispatch (real OpenCode CLI runs, real git worktrees, real local-model
// inference) is deliberately NOT exercised here - too slow/flaky for a
// regression suite and already covered by the manual E2E verification run
// (see the conversation this was built in). These tests cover the pure,
// cheaply-testable logic: report schema shape, offline-agent assignment,
// self-executed reporting, subtask leasing/ownership, and the %dp0%
// batch-shim path resolution that broke silently on first use.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

function mkTmpRoot() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-master-coordinator-'));
}

const REPORT_LOG = path.join(mkTmpRoot(), 'ai-agent-reports.jsonl');
process.env.AI_AGENT_REPORTS_PATH = REPORT_LOG;
process.env.WORLD_SERVER_RECOVERY_ROOT = path.join(mkTmpRoot(), 'recovery');

const mc = require('../scripts/master-coordinator.cjs');
const collectiveBrain = require('../lib/collective-brain');

function readReports() {
  try {
    return fs.readFileSync(REPORT_LOG, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

test('assignOffline writes an assigned-status entry using the existing shared report schema, invokes nothing', () => {
  const before = readReports().length;
  const r = mc.assignOffline('chatgpt', 'review the deploy docs for stale instructions', { taskId: 'offline-test-1' });
  assert.equal(r.ok, true);
  assert.equal(r.result, 'ASSIGNED');
  assert.equal(r.assignedTo, 'chatgpt');
  const reports = readReports();
  assert.equal(reports.length, before + 1);
  const entry = reports[reports.length - 1];
  assert.equal(entry.agent, 'chatgpt');
  assert.equal(entry.status, 'assigned');
  assert.equal(entry.merge_safe, false);
  // Same field set every other agent in this project already writes.
  for (const field of ['at', 'agent', 'task_id', 'status', 'progress', 'branch', 'worktree', 'commit', 'pr', 'tests', 'blockers', 'merge_safe', 'next_action', 'findings', 'reusable_improvements']) {
    assert.ok(field in entry, `missing shared-schema field: ${field}`);
  }
});

test('assignOffline redacts secret-shaped task text before writing to the shared log', () => {
  mc.assignOffline('claude-desktop', 'use this token=super-secret-value-123 to authenticate', { taskId: 'offline-test-secret' });
  const entry = readReports().find((e) => e.task_id === 'offline-test-secret');
  assert.ok(entry);
  assert.ok(!entry.findings.task.includes('super-secret-value-123'), 'secret value must be redacted, not written verbatim to the shared log');
});

test('reportSelfExecuted PASS entry has status=done, progress=100, empty blockers', () => {
  const entry = mc.reportSelfExecuted('architecture review of the deploy pipeline', { ok: true, commit: 'abc123', branch: 'ai/desktop/test' }, { taskId: 'self-exec-pass' });
  assert.equal(entry.status, 'done');
  assert.equal(entry.progress, 100);
  assert.deepEqual(entry.blockers, []);
  assert.equal(entry.commit, 'abc123');
});

test('reportSelfExecuted FAIL entry carries a needs_review blocker with the real reason', () => {
  const entry = mc.reportSelfExecuted('integration blocker triage', { ok: false, reason: 'test failure XYZ' }, { taskId: 'self-exec-fail' });
  assert.equal(entry.status, 'failed');
  assert.equal(entry.blockers.length, 1);
  assert.equal(entry.blockers[0].reason, 'test failure XYZ');
  assert.equal(entry.blockers[0].status, 'needs_review');
});

test('appendReport failure (path is a directory, not a file) returns false without throwing', () => {
  // A path that IS an existing directory can never be appendFileSync'd as a
  // file (reliably EISDIR/EPERM across platforms) - a genuine, deterministic
  // write failure to prove appendReport degrades gracefully instead of
  // throwing and masking the real subtask result.
  const dirAsFilePath = mkTmpRoot();
  const ok = mc.appendReport({ at: new Date().toISOString(), agent: 'x' }, dirAsFilePath);
  assert.equal(ok, false);
});

test('withSubtaskLease: a second call for the SAME taskId while the first is in flight is skipped, not raced', async () => {
  const root = mkTmpRoot();
  let firstStarted = false;
  let secondSawSkip = false;
  const first = mc.withSubtaskLease(root, 'lease-collision-test', async () => {
    firstStarted = true;
    await new Promise((res) => setTimeout(res, 200));
    return { ok: true, result: 'PASS' };
  });
  await new Promise((res) => setTimeout(res, 30)); // let the first call acquire its lease
  assert.ok(firstStarted);
  const second = await mc.withSubtaskLease(root, 'lease-collision-test', async () => ({ ok: true, result: 'PASS' }));
  secondSawSkip = second.result === 'SKIPPED_ACTIVE';
  assert.ok(secondSawSkip, 'a concurrent dispatch to the same subtask id must be skipped, never allowed to race');
  const firstResult = await first;
  assert.equal(firstResult.result, 'PASS');
});

test('withSubtaskLease: releases its lease on completion so a later call for the same taskId can proceed', async () => {
  const root = mkTmpRoot();
  const r1 = await mc.withSubtaskLease(root, 'lease-sequential-test', async () => ({ ok: true, result: 'PASS' }));
  assert.equal(r1.result, 'PASS');
  const r2 = await mc.withSubtaskLease(root, 'lease-sequential-test', async () => ({ ok: true, result: 'PASS' }));
  assert.equal(r2.result, 'PASS', 'lease must be released after the first call completes, not held forever');
});

test('dispatchSubtask: an explicit chatgpt/claude-desktop agent hint is assigned offline, never invoked', async () => {
  const root = mkTmpRoot();
  const r = await mc.dispatchSubtask(root, { text: 'cross-review the deploy branch', agent: 'chatgpt', taskId: 'dispatch-offline-test' });
  assert.equal(r.result, 'ASSIGNED');
  assert.equal(r.agentId, 'chatgpt');
});

test('dispatchSubtask: an explicit claude-code/desktop-ai hint returns SELF_EXECUTE without invoking a subprocess', async () => {
  const root = mkTmpRoot();
  const r = await mc.dispatchSubtask(root, { text: 'review the architecture of the deploy pipeline', agent: 'claude-code', taskId: 'dispatch-self-exec-test' });
  assert.equal(r.result, 'SELF_EXECUTE');
  assert.equal(r.agentId, 'claude-code');
  assert.equal(r.taskText, 'review the architecture of the deploy pipeline');
});

test('dispatchSubtask: an unknown explicit agent id fails closed with UNKNOWN_AGENT rather than silently no-op-ing', async () => {
  const root = mkTmpRoot();
  const r = await mc.dispatchSubtask(root, { text: 'do something', agent: 'some-agent-that-does-not-exist', taskId: 'dispatch-unknown-agent-test' });
  assert.equal(r.result, 'UNKNOWN_AGENT');
  assert.equal(r.ok, false);
});

test('WORKTREES_ROOT is off Desktop (never creates a temp worktree on Desktop)', () => {
  assert.ok(!/\\Desktop\\/i.test(mc.WORKTREES_ROOT), `WORKTREES_ROOT must not live under Desktop: ${mc.WORKTREES_ROOT}`);
});

test('OFFLINE_ONLY_AGENTS and LOCAL_MODEL_AGENTS are disjoint (no agent is both auto-dispatched and offline-only)', () => {
  for (const id of mc.OFFLINE_ONLY_AGENTS) {
    assert.ok(!mc.LOCAL_MODEL_AGENTS.has(id), `${id} cannot be in both OFFLINE_ONLY_AGENTS and LOCAL_MODEL_AGENTS`);
    assert.ok(!mc.SELF_EXECUTE_AGENTS.has(id), `${id} cannot be in both OFFLINE_ONLY_AGENTS and SELF_EXECUTE_AGENTS`);
  }
});


test('buildDefaultSubtasks turns one goal into distinct OpenCode + OpenHuman slices', () => {
  const plan = mc.buildDefaultSubtasks('Deploy World_server to Google AI Studio / Cloud Run');
  assert.ok(plan.length >= 2);
  assert.deepEqual(plan.slice(0, 2).map((x) => x.agent), ['opencode', 'openhuman']);
  assert.notEqual(plan[0].taskId, plan[1].taskId);
  assert.match(plan[0].text, /Implementation\/test slice/);
  assert.match(plan[1].text, /read-only verification slice/);
});

test('summarizeMasterResults never reports PASS for queued, assigned, self-execute or failed work', () => {
  assert.equal(mc.summarizeMasterResults([{ result: 'PASS' }, { result: 'PASS' }]), 'PASS');
  for (const result of ['QUEUED', 'ASSIGNED', 'SELF_EXECUTE', 'SKIPPED_ACTIVE']) {
    assert.equal(mc.summarizeMasterResults([{ result: 'PASS' }, { result }]), 'PENDING');
  }
  assert.equal(mc.summarizeMasterResults([{ result: 'PASS' }, { result: 'FAIL' }]), 'FAIL');
});

function initGitFixture() {
  const dir = mkTmpRoot();
  cp.execFileSync('git', ['init', '-q'], { cwd: dir });
  cp.execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: dir });
  cp.execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'base\n');
  cp.execFileSync('git', ['add', 'tracked.txt'], { cwd: dir });
  cp.execFileSync('git', ['commit', '-qm', 'base'], { cwd: dir });
  return dir;
}

test('preserveFailedDirtyWorktree writes a binary-capable recovery patch for tracked dirty work', () => {
  const dir = initGitFixture();
  fs.writeFileSync(path.join(dir, 'tracked.txt'), 'changed\n');
  const r = mc.preserveFailedDirtyWorktree(dir, 'ai/test/recovery', 'tracked-recovery-test');
  assert.equal(r.preserved, true);
  assert.equal(r.keepWorktree, true);
  assert.equal(r.untrackedCount, 0);
  assert.ok(r.recoveryPatch && fs.existsSync(r.recoveryPatch));
  assert.match(fs.readFileSync(r.recoveryPatch, 'utf8'), /changed/);
});

test('preserveFailedDirtyWorktree keeps an off-Desktop worktree when untracked files exist', () => {
  const dir = initGitFixture();
  fs.writeFileSync(path.join(dir, 'new-file.txt'), 'unique untracked work\n');
  const r = mc.preserveFailedDirtyWorktree(dir, 'ai/test/recovery', 'untracked-recovery-test');
  assert.equal(r.preserved, true);
  assert.equal(r.keepWorktree, true);
  assert.equal(r.untrackedCount, 1);
  assert.ok(fs.existsSync(path.join(r.recoveryDir, 'STATUS.txt')));
});

test('Windows OpenCode resolver uses the real executable when OpenCode is installed', { skip: process.platform !== 'win32' || !mc.OPENCODE_CLI_PATH }, () => {
  assert.match(mc.OPENCODE_CLI_PATH, /\.exe$/i);
  const r = cp.spawnSync(mc.OPENCODE_CLI_PATH, ['--version'], { encoding: 'utf8', windowsHide: true });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /\d+\.\d+\.\d+/);
});

test('runMasterGoal with one goal auto-dispatches the default multi-agent plan and gates overall PASS', async () => {
  const root = mkTmpRoot();
  const seen = [];
  const r = await mc.runMasterGoal('Deploy World_server safely', undefined, {
    root,
    skipNetwork: true,
    dispatchFn: async (_root, subtask) => {
      seen.push(subtask.agent);
      return { agentId: subtask.agent, ok: true, result: 'PASS' };
    },
  });
  assert.deepEqual(seen, ['opencode', 'openhuman']);
  assert.equal(r.plan.length, 2);
  assert.equal(r.overallStatus, 'PASS');
});
