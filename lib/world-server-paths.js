'use strict';

const path = require('path');
const cp = require('child_process');

const SOURCE_ROOT = path.resolve(__dirname, '..');

function gitMainWorktree(sourceRoot = SOURCE_ROOT) {
  try {
    const r = cp.spawnSync('git', ['-C', sourceRoot, 'worktree', 'list', '--porcelain'], {
      encoding: 'utf8', windowsHide: true, timeout: 5000,
    });
    if (r.status !== 0) return null;
    const first = String(r.stdout || '').split(/\r?\n/).find((line) => line.startsWith('worktree '));
    return first ? first.slice('worktree '.length).trim() : null;
  } catch {
    return null;
  }
}

function resolveMainTreeRoot() {
  if (process.env.WORLD_SERVER_MAIN_TREE) return path.resolve(process.env.WORLD_SERVER_MAIN_TREE);
  return gitMainWorktree() || SOURCE_ROOT;
}

function sourcePath(...parts) {
  return path.join(SOURCE_ROOT, ...parts);
}

module.exports = { SOURCE_ROOT, gitMainWorktree, resolveMainTreeRoot, sourcePath };
