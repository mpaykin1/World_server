'use strict';

const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');

function runGit(cwd, args, timeout) {
  return cp.spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, timeout });
}

// Fetch changes Git metadata only: never switch/reset/stash the user's checkout.
function createCurrentWorktree(taskId, { mainRoot, worktreesRoot, git = runGit }) {
  const remoteRef = 'refs/remotes/origin/master';
  const fetched = git(mainRoot, ['fetch', '--no-tags', '--no-write-fetch-head', 'origin',
    `+refs/heads/master:${remoteRef}`], 30000);
  if (fetched.status !== 0 || fetched.error) throw new Error('Cannot refresh origin/master; refusing stale agent worktree');
  const resolved = git(mainRoot, ['rev-parse', '--verify', `${remoteRef}^{commit}`], 5000);
  const baseSha = String(resolved.stdout || '').trim();
  if (resolved.status !== 0 || resolved.error || !/^[a-f0-9]{40}$/.test(baseSha)) {
    throw new Error('Cannot verify origin/master commit; refusing agent worktree');
  }
  const branch = `ai/master-coordinator/${taskId}`;
  const dir = path.join(worktreesRoot, taskId);
  fs.mkdirSync(worktreesRoot, { recursive: true });
  const added = git(mainRoot, ['worktree', 'add', '-b', branch, dir, baseSha], 30000);
  if (added.status !== 0 || added.error) throw new Error('git worktree add failed for verified origin/master');
  return { dir, branch, baseSha };
}

module.exports = { createCurrentWorktree };
