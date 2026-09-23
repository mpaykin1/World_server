'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createCurrentWorktree } = require('../lib/coordinator-worktree');

const fresh = '1ed5d8f8f157d390db646f047e03eab64a1f17b9';
const stale = 'd06cb3ed737718576f2cd933a6df31b7748bbf4c';
function fixture(t, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'coordinator-base-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const mainRoot = path.join(root, 'main');
  const worktreesRoot = path.join(root, 'worktrees');
  fs.mkdirSync(mainRoot);
  fs.writeFileSync(path.join(mainRoot, 'dirty.txt'), 'user work');
  const calls = [];
  const git = (cwd, args, timeout) => {
    calls.push({ cwd, args, timeout });
    assert.equal(cwd, mainRoot);
    if (overrides[args[0]]) return overrides[args[0]];
    if (args[0] === 'fetch' || args[0] === 'worktree') return { status: 0, stdout: '' };
    if (args[0] === 'rev-parse') return { status: 0, stdout: args.includes('HEAD') ? stale : `${fresh}\n` };
    throw new Error(`Unexpected Git mutation: ${args[0]}`);
  };
  return { root, mainRoot, worktreesRoot, git, calls };
}

test('coordinator creates from freshly fetched remote master, never dirty checkout HEAD', t => {
  const f = fixture(t);
  const result = createCurrentWorktree('test-task', f);
  assert.equal(result.baseSha, fresh);
  assert.equal(result.branch, 'ai/master-coordinator/test-task');
  assert.equal(result.dir, path.join(f.worktreesRoot, 'test-task'));
  assert.deepEqual(f.calls.map(c => c.args), [
    ['fetch', '--no-tags', '--no-write-fetch-head', 'origin', '+refs/heads/master:refs/remotes/origin/master'],
    ['rev-parse', '--verify', 'refs/remotes/origin/master^{commit}'],
    ['worktree', 'add', '-b', result.branch, result.dir, fresh]
  ]);
  assert.deepEqual(f.calls.map(c => c.timeout), [30000, 5000, 30000]);
  assert.equal(fs.readFileSync(path.join(f.mainRoot, 'dirty.txt'), 'utf8'), 'user work');
});

for (const failure of [{ status: 1 }, { status: null, error: new Error('timeout') }, { status: 0, error: new Error('spawn failed') }]) {
  test(`failed fetch (${failure.status}, ${Boolean(failure.error)}) never uses cached remote SHA`, t => {
    const f = fixture(t, { fetch: failure });
    assert.throws(() => createCurrentWorktree('blocked', f), /Cannot refresh origin\/master/);
    assert.equal(f.calls.length, 1);
    assert.equal(fs.existsSync(f.worktreesRoot), false);
  });
}

for (const resolution of [{ status: 1, stdout: fresh }, { status: 0, stdout: '' },
  { status: 0, stdout: 'HEAD' }, { status: 0, stdout: `${fresh}\n${stale}` },
  { status: 0, stdout: fresh, error: new Error('timeout') }]) {
  test(`unverified remote commit ${JSON.stringify(resolution)} never creates a worktree`, t => {
    const f = fixture(t, { 'rev-parse': resolution });
    assert.throws(() => createCurrentWorktree('blocked', f), /Cannot verify origin\/master/);
    assert.equal(f.calls.length, 2);
    assert.equal(fs.existsSync(f.worktreesRoot), false);
  });
}

test('worktree creation failure cannot be reported as ready', t => {
  const f = fixture(t, { worktree: { status: 1 } });
  assert.throws(() => createCurrentWorktree('blocked', f), /worktree add failed/);
});
