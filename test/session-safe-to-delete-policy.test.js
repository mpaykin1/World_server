'use strict';
// Regression tests for the GLOBAL SESSION SAFE-TO-DELETE policy
// (scripts/lib/session-safe-to-delete-registry.cjs), wired into
// scripts/desktop-ai-session-housekeeping.cjs as `safe-register` / `safe-gate`.
//
// Each test uses a disposable fixture directory tree standing in for the real
// Desktop, so the real user Desktop is never touched by this suite.
//
// Run: node --test test/session-safe-to-delete-policy.test.js

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const cp = require('child_process');

const registry = require('../scripts/lib/session-safe-to-delete-registry.cjs');

function sh(cwd, cmd, args) {
  const r = cp.spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true });
  return { status: r.status, stdout: (r.stdout || '').trim(), stderr: (r.stderr || '').trim() };
}

function mkDesktop() {
  const desktopRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-desktop-'));
  const canonicalRoot = path.join(desktopRoot, 'SESSION_SAFE_TO_DELETE');
  return { desktopRoot, canonicalRoot };
}

function mkGitRepo(atPath) {
  fs.mkdirSync(atPath, { recursive: true });
  sh(atPath, 'git', ['init', '-q', '-b', 'master']);
  sh(atPath, 'git', ['config', 'user.email', 'test@test.local']);
  sh(atPath, 'git', ['config', 'user.name', 'Test']);
  fs.writeFileSync(path.join(atPath, 'README.md'), 'hello\n');
  sh(atPath, 'git', ['add', '.']);
  sh(atPath, 'git', ['commit', '-qm', 'init']);
  return atPath;
}

// 1. junk outside SESSION_SAFE_TO_DELETE -> FAIL
test('proven-safe junk left outside the shared folder and unregistered -> gate FAILs', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  const report = registry.gate({
    desktopRoot, root: canonicalRoot,
    unregisteredJunk: [{ path: 'C:/somewhere/leftover.tmp-123-456', provenSafe: true }],
  });
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.reasons.join(' | '), /proven-safe junk left outside/);
});

// 2. safely registered undeletable item -> PASS or WARN per rules
test('an item registered as a manual-delete candidate does not itself fail the gate', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  registry.registerManualCandidate(canonicalRoot, 'C:/some/unclear-thing', {
    reason: 'unclear ownership', whyNotAuto: 'could not confirm no active process uses it',
    agent: 'CLAUDE', safeToDeleteManually: 'UNKNOWN',
  });
  const report = registry.gate({ desktopRoot, root: canonicalRoot });
  assert.notEqual(report.verdict, 'FAIL');
  const readme = fs.readFileSync(path.join(canonicalRoot, 'README.txt'), 'utf8');
  assert.match(readme, /unclear-thing/);
  assert.match(readme, /SAFE TO DELETE MANUALLY: UNKNOWN/);
});

// 3. dirty worktree -> never moved, never deleted
test('a dirty worktree is refused by moveToSafeToDelete and left untouched', () => {
  const { canonicalRoot } = mkDesktop();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-repo-'));
  const main = mkGitRepo(path.join(repoRoot, 'main'));
  sh(main, 'git', ['branch', 'b-dirty']);
  const wtPath = path.join(repoRoot, 'wt-dirty');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'b-dirty']);
  fs.appendFileSync(path.join(wtPath, 'README.md'), 'change\n');

  const result = registry.moveToSafeToDelete(canonicalRoot, wtPath, { isWorktree: true, agent: 'CLAUDE' });
  assert.equal(result.moved, false);
  assert.match(result.reason, /dirty/);
  assert.ok(fs.existsSync(wtPath), 'dirty worktree must still exist on disk');
});

// 4. unique unpushed commit -> never moved, never deleted
test('a worktree with a commit not reachable from master/upstream is refused', () => {
  const { canonicalRoot } = mkDesktop();
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-repo-'));
  const main = mkGitRepo(path.join(repoRoot, 'main'));
  sh(main, 'git', ['checkout', '-qb', 'feature']);
  fs.writeFileSync(path.join(main, 'unique.txt'), 'x');
  sh(main, 'git', ['add', '.']);
  sh(main, 'git', ['commit', '-qm', 'unique unpushed work']);
  sh(main, 'git', ['checkout', '-q', 'master']);
  const wtPath = path.join(repoRoot, 'wt-feature');
  sh(main, 'git', ['worktree', 'add', '-q', wtPath, 'feature']);

  const result = registry.moveToSafeToDelete(canonicalRoot, wtPath, { isWorktree: true, agent: 'CLAUDE' });
  assert.equal(result.moved, false);
  assert.match(result.reason, /unique unpushed|not an ancestor/);
  assert.ok(fs.existsSync(wtPath));
});

// 5. active AI/process data -> never touched
test('a path guarded by a live lock marker is refused, not moved', () => {
  const { canonicalRoot } = mkDesktop();
  const target = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-active-'));
  fs.writeFileSync(`${target}.lock`, 'held');
  const result = registry.moveToSafeToDelete(canonicalRoot, target, { agent: 'CLAUDE' });
  assert.equal(result.moved, false);
  assert.match(result.reason, /locked/);
  assert.ok(fs.existsSync(target));
  fs.rmSync(`${target}.lock`);
});

// 6. duplicate SAFE_TO_DELETE_2 -> FAIL
test('a duplicate SAFE_TO_DELETE-style folder next to the canonical one fails the gate', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  fs.mkdirSync(canonicalRoot, { recursive: true });
  fs.mkdirSync(path.join(desktopRoot, 'SAFE_TO_DELETE_2'), { recursive: true });
  const report = registry.gate({ desktopRoot, root: canonicalRoot });
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.reasons.join(' | '), /duplicate SAFE_TO_DELETE-style folder/);
});

// 7. existing shared SESSION_SAFE_TO_DELETE reused -> no second folder created, gate PASS
test('calling register twice reuses the same canonical folder, never creates a second one', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  registry.registerManualCandidate(canonicalRoot, 'C:/thing1', { reason: 'r1', agent: 'CLAUDE', safeToDeleteManually: 'UNKNOWN' });
  registry.registerManualCandidate(canonicalRoot, 'C:/thing2', { reason: 'r2', agent: 'CHATGPT', safeToDeleteManually: 'UNKNOWN' });
  const dirs = fs.readdirSync(desktopRoot, { withFileTypes: true }).filter((e) => e.isDirectory());
  assert.equal(dirs.length, 1, 'only the one canonical folder should exist');
  assert.equal(dirs[0].name, 'SESSION_SAFE_TO_DELETE');
  const report = registry.gate({ desktopRoot, root: canonicalRoot });
  assert.notEqual(report.verdict, 'FAIL');
});

// 8. README append does not destroy other agents' entries
test('appending a new entry preserves every previously registered entry from other agents', () => {
  const { canonicalRoot } = mkDesktop();
  registry.registerManualCandidate(canonicalRoot, 'C:/from-claude', { reason: 'claude reason', agent: 'CLAUDE', safeToDeleteManually: 'UNKNOWN' });
  registry.registerManualCandidate(canonicalRoot, 'C:/from-chatgpt', { reason: 'chatgpt reason', agent: 'CHATGPT', safeToDeleteManually: 'NO' });
  registry.registerMoved(canonicalRoot, 'C:/from-codex/junk.tmp', { reason: 'codex reason', agent: 'CODEX' });
  const readme = fs.readFileSync(path.join(canonicalRoot, 'README.txt'), 'utf8');
  assert.match(readme, /from-claude/);
  assert.match(readme, /from-chatgpt/);
  assert.match(readme, /from-codex/);
  assert.match(readme, /agent: CLAUDE/);
  assert.match(readme, /agent: CHATGPT/);
  assert.match(readme, /agent: CODEX/);
});

// 9. safe temporary artifact removed -> PASS (proven-safe pattern, auto-deleted outright)
test('a proven-safe orphaned temp file is deleted outright and reported', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-tmp-'));
  const tmpFile = path.join(dir, 'leftover.tmp-1234-567890');
  fs.writeFileSync(tmpFile, 'x');
  const result = registry.autoDeleteIfProvenSafe(tmpFile, { agent: 'CLAUDE' });
  assert.equal(result.deleted, true);
  assert.ok(!fs.existsSync(tmpFile));
});

test('autoDeleteIfProvenSafe refuses directories and non-matching names', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-tmp-'));
  const subdir = path.join(dir, 'some-dir.tmp-1-2');
  fs.mkdirSync(subdir);
  const notJunk = path.join(dir, 'important.txt');
  fs.writeFileSync(notJunk, 'x');
  assert.equal(registry.autoDeleteIfProvenSafe(subdir).deleted, false);
  assert.equal(registry.autoDeleteIfProvenSafe(notJunk).deleted, false);
  assert.ok(fs.existsSync(subdir));
  assert.ok(fs.existsSync(notJunk));
});

// 10. unknown-risk artifact -> MANUAL_DELETE_CANDIDATES, not deleted
test('an unknown-risk artifact is registered under MANUAL_DELETE_CANDIDATES, not deleted, not moved', () => {
  const { canonicalRoot } = mkDesktop();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wsh-unknown-'));
  const mystery = path.join(dir, 'mystery-cache-folder');
  fs.mkdirSync(mystery);
  fs.writeFileSync(path.join(mystery, 'data.bin'), 'x');

  registry.registerManualCandidate(canonicalRoot, mystery, {
    reason: 'unrecognized directory, no owning task/session record found',
    whyNotAuto: 'cannot prove it is disposable; may belong to an unrelated tool',
    agent: 'CLAUDE', safeToDeleteManually: 'UNKNOWN',
  });

  assert.ok(fs.existsSync(mystery), 'unknown-risk artifact must not be deleted');
  const readme = fs.readFileSync(path.join(canonicalRoot, 'README.txt'), 'utf8');
  const manualSection = readme.slice(readme.indexOf(registry.MANUAL_START), readme.indexOf(registry.MANUAL_END));
  assert.match(manualSection, /mystery-cache-folder/);
  assert.match(manualSection, /SAFE TO DELETE MANUALLY: UNKNOWN/);
  const entriesSection = readme.slice(readme.indexOf(registry.ENTRIES_START), readme.indexOf(registry.ENTRIES_END));
  assert.doesNotMatch(entriesSection, /mystery-cache-folder/, 'must not appear in the moved-items section');
});

test('detectDuplicateSafeFolders ignores the canonical folder itself', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  fs.mkdirSync(canonicalRoot, { recursive: true });
  const dupes = registry.detectDuplicateSafeFolders(desktopRoot, canonicalRoot);
  assert.deepEqual(dupes, []);
});

test('a corrupt README (missing markers) is refused rather than silently overwritten', () => {
  const { canonicalRoot } = mkDesktop();
  fs.mkdirSync(canonicalRoot, { recursive: true });
  fs.writeFileSync(path.join(canonicalRoot, 'README.txt'), 'not a valid registry file\n');
  assert.throws(() => registry.registerManualCandidate(canonicalRoot, 'C:/x', { reason: 'r', agent: 'CLAUDE' }), /markers missing or corrupt/);
});

// ---------------------------------------------------------------------------
// DESKTOP ZERO-CHAOS HARD GATE
// ---------------------------------------------------------------------------

test('scanForbiddenDesktopClutter flags an unregistered World_server_copy-style folder', () => {
  const { desktopRoot } = mkDesktop();
  fs.mkdirSync(path.join(desktopRoot, 'World_server_copy'), { recursive: true });
  const clutter = registry.scanForbiddenDesktopClutter(desktopRoot, []);
  assert.deepEqual(clutter, ['World_server_copy']);
});

test('scanForbiddenDesktopClutter flags registered secondary worktrees on Desktop', () => {
  const { desktopRoot } = mkDesktop();
  const wt = path.join(desktopRoot, 'World_server_backup_task_runner');
  fs.mkdirSync(wt, { recursive: true });
  const clutter = registry.scanForbiddenDesktopClutter(desktopRoot, [wt]);
  assert.deepEqual(clutter, ['World_server_backup_task_runner'], 'registered worktrees must live outside Desktop');
});

test('scanForbiddenDesktopClutter flags every secondary World_server task folder', () => {
  const { desktopRoot } = mkDesktop();
  fs.mkdirSync(path.join(desktopRoot, 'World_server_chatgpt_hourly'), { recursive: true });
  const clutter = registry.scanForbiddenDesktopClutter(desktopRoot, []);
  assert.deepEqual(clutter, ['World_server_chatgpt_hourly']);
});

test('scanForbiddenDesktopClutter catches backup/tmp/sandbox-copy/integration_tmp variants', () => {
  const { desktopRoot } = mkDesktop();
  const names = ['World_server_backup', 'World_server_tmp', 'World_server_sandbox_copy', 'World_server_integration_tmp', 'World_server_AI_2'];
  for (const n of names) fs.mkdirSync(path.join(desktopRoot, n), { recursive: true });
  const clutter = registry.scanForbiddenDesktopClutter(desktopRoot, []).sort();
  assert.deepEqual(clutter, names.sort());
});

test('desktopZeroChaosGate: PASS only with the main World_server folder and canonical cleanup folder', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  const wt = path.join(desktopRoot, 'World_server');
  fs.mkdirSync(wt, { recursive: true });
  fs.mkdirSync(canonicalRoot, { recursive: true });
  fs.writeFileSync(path.join(desktopRoot, 'WORLD_SERVER_KEEP.zip'), 'fixture');
  const report = registry.desktopZeroChaosGate({ desktopRoot, root: canonicalRoot, registeredWorktreePaths: [wt] });
  assert.equal(report.verdict, 'PASS');
});

test('desktopZeroChaosGate: FAIL when an unregistered backup/copy-style folder exists on Desktop', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  fs.mkdirSync(path.join(desktopRoot, 'World_server_backup_final'), { recursive: true });
  const report = registry.desktopZeroChaosGate({ desktopRoot, root: canonicalRoot, registeredWorktreePaths: [] });
  assert.equal(report.verdict, 'FAIL');
  assert.match(report.reasons.join(' | '), /World_server_backup_final/);
});

test('desktopZeroChaosGate: FAIL when a duplicate SAFE_TO_DELETE-style folder exists, even with zero clutter', () => {
  const { desktopRoot, canonicalRoot } = mkDesktop();
  fs.mkdirSync(canonicalRoot, { recursive: true });
  fs.mkdirSync(path.join(desktopRoot, 'SAFE_TO_DELETE_2'), { recursive: true });
  const report = registry.desktopZeroChaosGate({ desktopRoot, root: canonicalRoot, registeredWorktreePaths: [] });
  assert.equal(report.verdict, 'FAIL');
});
