'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const childProcess = require('node:child_process');

// Install before importing modules that capture spawnSync. Real Git still runs,
// but a test regression cannot mutate the checkout or contact a remote host.
function createOfflineGitFixture() {
  const directory = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'world-server-adapters-')));
  const mainRoot = path.join(directory, 'main');
  const origin = path.join(directory, 'origin.git');
  const previousSpawn = childProcess.spawnSync;
  const previousEnv = new Map();
  const gitCalls = [];
  let baseline;

  function setEnv(name, value) {
    previousEnv.set(name, process.env[name]);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }

  function contains(candidate) {
    const relative = path.relative(directory, fs.realpathSync(candidate));
    return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
  }

  setEnv('LOCALAPPDATA', path.join(directory, 'local'));
  setEnv('GIT_ALLOW_PROTOCOL', 'file');
  setEnv('GIT_TERMINAL_PROMPT', '0');
  // An inherited repository selector must not redirect fixture commands into
  // the developer's repository. Keep inherited Git configuration untouched.
  for (const key of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR', 'GIT_INDEX_FILE',
    'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_NAMESPACE']) setEnv(key, undefined);

  childProcess.spawnSync = function fixtureSpawn(command, args, options = {}) {
    if (path.basename(command).replace(/\.exe$/i, '') === 'git') {
      const cwd = options.cwd || process.cwd();
      gitCalls.push({ args: [...args], cwd });
      assert.ok(contains(cwd), `fixture Git must stay inside ${directory}: ${cwd}`);
      assert.equal((options.env || process.env).GIT_ALLOW_PROTOCOL, 'file', 'fixture Git allows only local file transport');
    }
    return previousSpawn(command, args, options);
  };

  function git(args, cwd = mainRoot) {
    const result = childProcess.spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 15000 });
    assert.equal(result.status, 0, result.stderr || result.error?.message);
    return result.stdout.trim();
  }

  function state() {
    return {
      refs: git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads']),
      worktrees: git(['worktree', 'list', '--porcelain']),
    };
  }

  function cleanup() {
    try {
      if (baseline) assert.deepEqual(state(), baseline, 'fixture branches and worktrees must not leak');
    } finally {
      childProcess.spawnSync = previousSpawn;
      for (const [key, value] of previousEnv) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  }

  try {
    git(['init', '--initial-branch=master', '--template=', mainRoot], directory);
    const hooks = path.join(directory, 'hooks');
    fs.mkdirSync(hooks);
    git(['config', 'core.hooksPath', hooks]);
    fs.writeFileSync(path.join(mainRoot, 'seed.txt'), 'fixture\n');
    git(['add', 'seed.txt']);
    git(['-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid',
      '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture']);
    git(['init', '--bare', '--initial-branch=master', '--template=', origin], directory);
    git(['remote', 'add', 'origin', origin]);
    git(['push', '-u', 'origin', 'master']);
    baseline = state();
    return { directory, mainRoot, origin, git, gitCalls, cleanup };
  } catch (error) {
    cleanup();
    throw error;
  }
}

module.exports = { createOfflineGitFixture };
