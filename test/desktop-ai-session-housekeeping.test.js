'use strict';
// Regression tests for scripts/desktop-ai-session-housekeeping.cjs
// (WORLD_SERVER ZERO-JUNK / SESSION-END HOUSEKEEPING policy, see AGENTS.md).
//
// Mirrors the style of test/cas-gc.test.js: build a disposable fixture git
// repo per test, run the real CLI against it (child_process), assert on
// real `git worktree list` / filesystem state afterward. No mocking of git.
//
// Run: node --test test/desktop-ai-session-housekeeping.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'desktop-ai-session-housekeeping.cjs');

function sh(cwd, cmd, args, env) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', env: { ...process.env, ...env } });
  if (r.status !== 0 && cmd === 'git') throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`);
  return r;
}

function mkFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-fixture-'));
  const main = path.join(root, 'main');
  fs.mkdirSync(path.join(main, 'scripts', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(main, 'config'), { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(main, 'scripts', 'desktop-ai-session-housekeeping.cjs'));
  fs.copyFileSync(path.resolve(__dirname, '..', 'scripts', 'lib', 'session-safe-to-delete-registry.cjs'), path.join(main, 'scripts', 'lib', 'session-safe-to-delete-registry.cjs'));
  fs.writeFileSync(path.join(main, 'config', 'desktop-worktree-policy.json'), JSON.stringify({
    worktrees: { maxActiveWorktrees: 12, warnActiveWorktrees: 8, worktreeTtlDays: 7 },
    temp: { tempTtlDays: 2, cacheTtlDays: 7, orphanTmpFilePattern: '\\.tmp-\\d+-\\d+$', maxTempGB: 2 },
    logs: { logRetentionDays: 14 }, testOutput: { testOutputRetentionDays: 7 },
    sessionCleanup: { root: 'SESSION_CLEANUP_TEST' }
  }));
  sh(main, 'git', ['init', '-q', '-b', 'master']);
  sh(main, 'git', ['config', 'user.email', 'test@test.local']);
  sh(main, 'git', ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(main, 'README.md'), 'hello\n');
  sh(main, 'git', ['add', '.']);
  sh(main, 'git', ['commit', '-qm', 'init']);
  return { root, main };
}

function runCli(main, args, extraEnv) {
  const sessionRoot = path.join(main, '..', 'SESSION_CLEANUP_TEST');
  const scriptInFixture = path.join(main, 'scripts', 'desktop-ai-session-housekeeping.cjs');
  const r = cp.spawnSync(process.execPath, [scriptInFixture, ...args], {
    cwd: main, encoding: 'utf8',
    env: { ...process.env, WORLD_SERVER_SESSION_CLEANUP_ROOT: sessionRoot, ...extraEnv }
  });
  return { ...r, sessionRoot };
}

function worktreeList(main) {
  return sh(main, 'git', ['worktree', 'list', '--porcelain']).stdout;
}

// `git worktree list --porcelain` always emits forward-slash paths, even on
// Windows, while path.join()/path.resolve() on win32 produce backslashes.
// Comparing a raw path.join() result against porcelain output (or against
// manifest.path fields, which are parsed straight from that porcelain output)
// must go through this normalizer on both sides or the comparison silently
// never matches on Windows (found via a real `node --test` run, not just
// review -- see WORK_IN_PROGRESS.md).
function norm(p) { return p.split(path.sep).join('/'); }

test('audit never modifies the repository (pure discover+classify)', () => {
  const { main } = mkFixture();
  sh(main, 'git', ['branch', 'b1']);
  sh(main, 'git', ['worktree', 'add', '-q', path.join(main, '..', 'wt1'), 'b1']);
  const before = worktreeList(main);
  const r = runCli(main, ['audit', '--json']);
  assert.equal(r.status, 0);
  const after = worktreeList(main);
  assert.equal(before, after, 'audit must not change worktree registry');
  const report = JSON.parse(r.stdout);
  assert.equal(report.worktreeCount, 2);
});

test('a dirty worktree is never removed and never has files moved out of it', () => {
  const { main } = mkFixture();
  sh(main, 'git', ['branch', 'b-dirty']);
  const wtPath = path.join(main, '..', 'wt-dirty');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'b-dirty']);
  fs.appendFileSync(path.join(wtPath, 'README.md'), 'change\n');
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(wtPath), 'dirty worktree directory must still exist');
  const list = worktreeList(main);
  assert.ok(list.includes(norm(wtPath)), 'dirty worktree must remain registered');
  const manifest = JSON.parse(fs.readFileSync(path.join(r.sessionRoot, fs.readdirSync(r.sessionRoot)[0], 'MANIFEST.json'), 'utf8'));
  assert.deepEqual(manifest.dirtyWorktreesPreserved, [norm(wtPath)]);
});

test('a detached HEAD unreachable from any branch is archived before its worktree is removed, and the commit stays reachable', () => {
  const { main } = mkFixture();
  fs.writeFileSync(path.join(main, 'unique.txt'), 'x');
  sh(main, 'git', ['add', '.']);
  sh(main, 'git', ['commit', '-qm', 'unique commit']);
  const uniqueSha = sh(main, 'git', ['rev-parse', 'HEAD']).stdout.trim();
  sh(main, 'git', ['reset', '-q', '--hard', 'HEAD~1']);
  const wtPath = path.join(main, '..', 'wt-detached');
  sh(main, 'git', ['worktree', 'add', '-q', '--detach', wtPath, uniqueSha]);

  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(wtPath), 'archived+clean detached worktree should be removed');
  const branches = sh(main, 'git', ['branch', '-a']).stdout;
  assert.match(branches, /archive\/cleanup-\d{8}\/wt-detached/, 'an archive branch must have been created');
  const reachable = sh(main, 'git', ['log', '--all', '--oneline']).stdout;
  assert.match(reachable, /unique commit/, 'the commit must remain reachable via the archive branch, not lost');
});

test('an orphan admin entry (folder deleted outside git) is pruned, never treated as data loss', () => {
  const { main } = mkFixture();
  sh(main, 'git', ['branch', 'b-orphan']);
  const wtPath = path.join(main, '..', 'wt-orphan');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'b-orphan']);
  fs.rmSync(wtPath, { recursive: true, force: true });
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  const list = worktreeList(main);
  assert.ok(!list.includes(norm(wtPath)), 'orphan admin entry must be pruned');
});

test('a clean worktree whose branch is already merged into master is removed via `git worktree remove`, not raw deletion', () => {
  const { main } = mkFixture();
  sh(main, 'git', ['branch', 'b-merged']);
  const wtPath = path.join(main, '..', 'wt-merged');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'b-merged']);
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(wtPath));
  // branch itself must NOT be deleted, only the worktree checkout
  const branches = sh(main, 'git', ['branch']).stdout;
  assert.match(branches, /b-merged/, 'the branch must be preserved even after the worktree is removed');
});

test('node_modules and .cache are never written into KEEP/ZIP-equivalent state; only moved to SAFE_TO_DELETE', () => {
  const { main } = mkFixture();
  fs.mkdirSync(path.join(main, '.cache'));
  fs.writeFileSync(path.join(main, '.cache', 'x.bin'), 'junk');
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(!fs.existsSync(path.join(main, '.cache')), '.cache must be moved out of the working tree');
  const sessionDir = path.join(r.sessionRoot, fs.readdirSync(r.sessionRoot)[0]);
  assert.ok(fs.existsSync(path.join(sessionDir, 'SAFE_TO_DELETE', '.cache', 'x.bin')), 'must be moved (not copied+left behind) into SAFE_TO_DELETE');
});

test('dry-run (no --apply) never touches the filesystem, only writes the report', () => {
  const { main } = mkFixture();
  fs.mkdirSync(path.join(main, '.cache'));
  fs.writeFileSync(path.join(main, '.cache', 'x.bin'), 'junk');
  const before = worktreeList(main);
  const r = runCli(main, ['run', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(main, '.cache', 'x.bin')), 'dry-run must not move files');
  assert.equal(worktreeList(main), before);
});

test('a failed/incomplete run (dirty worktree present) sets safeToDeleteApproved=false and writes "НЕ УДАЛЯТЬ"', () => {
  const { main } = mkFixture();
  sh(main, 'git', ['branch', 'b-dirty2']);
  const wtPath = path.join(main, '..', 'wt-dirty2');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'b-dirty2']);
  fs.appendFileSync(path.join(wtPath, 'README.md'), 'x\n');
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  const sessionDir = path.join(r.sessionRoot, fs.readdirSync(r.sessionRoot)[0]);
  const manifest = JSON.parse(fs.readFileSync(path.join(sessionDir, 'MANIFEST.json'), 'utf8'));
  assert.equal(manifest.safeToDeleteApproved, false);
  const readme = fs.readFileSync(path.join(sessionDir, 'README.txt'), 'utf8');
  assert.match(readme, /НЕ УДАЛЯТЬ SAFE_TO_DELETE/);
});

test('re-running audit/run is idempotent: second run with nothing new to do makes no further changes', () => {
  const { main } = mkFixture();
  sh(main, 'git', ['branch', 'b-merged2']);
  const wtPath = path.join(main, '..', 'wt-merged2');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'b-merged2']);
  const r1 = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r1.status, 0, r1.stderr);
  const listAfterFirst = worktreeList(main);
  const r2 = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r2.status, 0, r2.stderr);
  assert.equal(worktreeList(main), listAfterFirst, 'second run must be a no-op on an already-clean repo');
});

test('an empty/clean session produces a tiny report, not gigabytes of bookkeeping', () => {
  const { main } = mkFixture();
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  const sessionDir = path.join(r.sessionRoot, fs.readdirSync(r.sessionRoot)[0]);
  const manifestSize = fs.statSync(path.join(sessionDir, 'MANIFEST.json')).size;
  assert.ok(manifestSize < 5000, `manifest for an empty session should be small, was ${manifestSize} bytes`);
  assert.equal(fs.existsSync(path.join(sessionDir, 'SAFE_TO_DELETE')), true);
  assert.deepEqual(fs.readdirSync(path.join(sessionDir, 'SAFE_TO_DELETE')), []);
});

test('secrets-like paths (.env, WORLD_SERVER_SECRETS) are never scanned or moved', () => {
  const { main } = mkFixture();
  fs.writeFileSync(path.join(main, '.env'), 'SECRET=1');
  fs.mkdirSync(path.join(main, 'WORLD_SERVER_SECRETS'));
  fs.writeFileSync(path.join(main, 'WORLD_SERVER_SECRETS', 'k.txt'), 'k');
  const r = runCli(main, ['run', '--apply', '--agent', 'TEST']);
  assert.equal(r.status, 0, r.stderr);
  assert.ok(fs.existsSync(path.join(main, '.env')));
  assert.ok(fs.existsSync(path.join(main, 'WORLD_SERVER_SECRETS', 'k.txt')));
});
