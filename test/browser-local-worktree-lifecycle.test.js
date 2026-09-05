'use strict';
// Regression tests for the browser-local worktree leak root-cause fix:
// scripts/lib/task-worktree-lifecycle.cjs, wired into scripts/browser-local-worker.cjs
// (and scripts/browser-local-worker-live.cjs) via a try/finally around task
// execution. Builds a disposable fixture git repo and drives the REAL worker
// module's tick()/sweep() against it — no mocking of git.
//
// Run: node --test test/browser-local-worktree-lifecycle.test.js
// Lives in test/ (sibling of scripts/ and lib/) inside the
// World_server_browser_local worktree, matching this repo's existing test
// layout (e.g. test/cas-gc.test.js in the main World_server worktree).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const SRC_ROOT = path.resolve(__dirname, '..'); // World_server_browser_local
const WORKER_SRC = path.join(SRC_ROOT, 'scripts', 'browser-local-worker.cjs');
const LIFECYCLE_SRC = path.join(SRC_ROOT, 'lib', 'task-worktree-lifecycle.cjs');
const CONTROL_DIR_SRC = path.join(SRC_ROOT, 'lib', 'browser-local-control');

function sh(cwd, cmd, args) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8' });
  return r;
}

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bl-worker-fixture-'));
  fs.mkdirSync(path.join(root, 'scripts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'lib', 'browser-local-control'), { recursive: true });
  fs.mkdirSync(path.join(root, 'state', 'browser-local-queue'), { recursive: true });
  fs.mkdirSync(path.join(root, 'state', 'browser-local-results'), { recursive: true });
  fs.mkdirSync(path.join(root, 'state', 'browser-local-artifacts'), { recursive: true });
  fs.mkdirSync(path.join(root, 'state', 'browser-local-worktrees'), { recursive: true });
  fs.copyFileSync(WORKER_SRC, path.join(root, 'scripts', 'browser-local-worker.cjs'));
  fs.copyFileSync(LIFECYCLE_SRC, path.join(root, 'lib', 'task-worktree-lifecycle.cjs'));
  fs.copyFileSync(path.join(CONTROL_DIR_SRC, 'index.js'), path.join(root, 'lib', 'browser-local-control', 'index.js'));
  fs.copyFileSync(path.join(CONTROL_DIR_SRC, 'capabilities.json'), path.join(root, 'lib', 'browser-local-control', 'capabilities.json'));
  sh(root, 'git', ['init', '-q', '-b', 'master']);
  sh(root, 'git', ['config', 'user.email', 'test@test.local']);
  sh(root, 'git', ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(root, 'README.md'), 'hello\n');
  sh(root, 'git', ['add', '-A']);
  sh(root, 'git', ['commit', '-qm', 'init']);
  return root;
}

function writeTask(root, id, capability, args) {
  const task = {
    task_id: id, capability, args: args || {}, requested_by: 'test', repo: 'x/x',
    worktree_mode: 'isolated', risk: 'medium', status: 'queued',
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600000).toISOString(),
    idempotency_key: 'idem_' + id
  };
  fs.writeFileSync(path.join(root, 'state', 'browser-local-queue', `${id}.json`), JSON.stringify(task, null, 2));
}

function wtPath(root, id) { return path.join(root, 'state', 'browser-local-worktrees', id); }

test('a successful isolated task creates then releases its worktree; the branch survives', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const id = 'task_success_1';
  writeTask(root, id, 'git.apply_patch', { path: `reports/${id}.txt`, content: 'hi\n' });
  const r = await worker.tick();
  assert.equal(r.status, 'completed');
  assert.equal(fs.existsSync(wtPath(root, id)), false);
  const branches = sh(root, 'git', ['branch']).stdout;
  assert.match(branches, new RegExp(`browser-task/${id}`));
});

test('a failing task still releases its worktree via finally', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const id = 'task_fail_1';
  writeTask(root, id, 'git.apply_patch', { path: '../escape.txt', content: 'x' });
  const r = await worker.tick();
  assert.equal(r.status, 'failed');
  assert.equal(fs.existsSync(wtPath(root, id)), false);
});

test('N sequential tasks leave zero lingering worktrees', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const N = 20;
  for (let i = 0; i < N; i++) {
    writeTask(root, `task_seq_${i}`, 'git.apply_patch', { path: `reports/seq_${i}.txt`, content: `n=${i}\n` });
    const r = await worker.tick();
    assert.equal(r.status, 'completed');
  }
  const dir = path.join(root, 'state', 'browser-local-worktrees');
  const count = fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory()).length;
  assert.equal(count, 0, `expected 0 worktrees after ${N} tasks, found ${count}`);
});

test('startup sweep reclaims a completed task worktree a prior crash left unreleased', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const id = 'task_crash_1';
  const branch = `browser-task/${id}`;
  sh(root, 'git', ['branch', branch]);
  sh(root, 'git', ['worktree', 'add', wtPath(root, id), branch]);
  fs.writeFileSync(path.join(root, 'state', 'browser-local-results', `${id}.json`), JSON.stringify({ task_id: id, status: 'completed' }));
  const report = worker.sweep();
  assert.ok(report.released.some(r => r.taskId === id));
  assert.equal(fs.existsSync(wtPath(root, id)), false);
});

test('a dirty worktree is never removed by tick() or by sweep', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const id = 'task_dirty_1';
  const branch = `browser-task/${id}`;
  sh(root, 'git', ['branch', branch]);
  sh(root, 'git', ['worktree', 'add', wtPath(root, id), branch]);
  fs.writeFileSync(path.join(wtPath(root, id), 'uncommitted.txt'), 'keep me');
  fs.writeFileSync(path.join(root, 'state', 'browser-local-results', `${id}.json`), JSON.stringify({ task_id: id, status: 'completed' }));
  const report = worker.sweep();
  assert.ok(report.skipped.some(s => s.taskId === id && s.reason === 'dirty'));
  assert.equal(fs.existsSync(wtPath(root, id)), true);
});

test('an active (still-running) task worktree is never swept', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const id = 'task_active_1';
  const branch = `browser-task/${id}`;
  sh(root, 'git', ['branch', branch]);
  sh(root, 'git', ['worktree', 'add', wtPath(root, id), branch]);
  fs.writeFileSync(path.join(root, 'state', 'browser-local-queue', `${id}.json`), JSON.stringify({ task_id: id, status: 'running' }));
  const report = worker.sweep();
  assert.ok(report.skipped.some(s => s.taskId === id && s.reason === 'status_running'));
  assert.equal(fs.existsSync(wtPath(root, id)), true);
});

test('a worktree with no discoverable task record is reported but never auto-removed', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const id = 'task_unknown_1';
  const branch = `browser-task/${id}`;
  sh(root, 'git', ['branch', branch]);
  sh(root, 'git', ['worktree', 'add', wtPath(root, id), branch]);
  const report = worker.sweep();
  assert.ok(report.skipped.some(s => s.taskId === id && s.reason === 'no_task_record'));
  assert.equal(fs.existsSync(wtPath(root, id)), true);
});

test('releasing an already-released worktree is idempotent', async () => {
  const root = mkFixture();
  const lifecycle = require(path.join(root, 'lib', 'task-worktree-lifecycle.cjs'));
  const id = 'task_idem_1';
  const branch = `browser-task/${id}`;
  const worktreesDir = path.join(root, 'state', 'browser-local-worktrees');
  sh(root, 'git', ['branch', branch]);
  sh(root, 'git', ['worktree', 'add', wtPath(root, id), branch]);
  const r1 = lifecycle.releaseTaskWorktree(root, worktreesDir, id);
  assert.equal(r1.released, true);
  const r2 = lifecycle.releaseTaskWorktree(root, worktreesDir, id);
  assert.equal(r2.released, false);
  assert.equal(r2.reason, 'not_found');
});

test('two concurrent release attempts on the same worktree never both proceed', async () => {
  const root = mkFixture();
  const lifecycle = require(path.join(root, 'lib', 'task-worktree-lifecycle.cjs'));
  const id = 'task_race_1';
  const branch = `browser-task/${id}`;
  const worktreesDir = path.join(root, 'state', 'browser-local-worktrees');
  const wt = wtPath(root, id);
  sh(root, 'git', ['branch', branch]);
  sh(root, 'git', ['worktree', 'add', wt, branch]);
  fs.mkdirSync(`${wt}.release.lock`);
  const r = lifecycle.releaseTaskWorktree(root, worktreesDir, id);
  assert.equal(r.released, false);
  assert.equal(r.reason, 'busy');
  assert.equal(fs.existsSync(wt), true);
  fs.rmdirSync(`${wt}.release.lock`);
  const r2 = lifecycle.releaseTaskWorktree(root, worktreesDir, id);
  assert.equal(r2.released, true);
});

test('releasing a shared (non-isolated) task worktree is a no-op', async () => {
  const root = mkFixture();
  const worker = require(path.join(root, 'scripts', 'browser-local-worker.cjs'));
  const r = worker.releaseTaskWorktreeIfIsolated({ task_id: 'task_shared_1', worktree_mode: 'shared' });
  assert.equal(r, null);
});
