'use strict';

const { execFileSync, spawnSync } = require('node:child_process');

const SHA_PATTERN = /^[0-9a-f]{40}$/i;

function validateRevision(value, source) {
  const revision = String(value || '').trim();
  if (!SHA_PATTERN.test(revision)) {
    throw new Error(`${source} must be an exact 40-character Git SHA`);
  }
  return revision.toLowerCase();
}

function resolveRevision(env = process.env, gitRevision = () => execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' })) {
  if (env.WORKERS_CI_COMMIT_SHA) return validateRevision(env.WORKERS_CI_COMMIT_SHA, 'WORKERS_CI_COMMIT_SHA');
  if (env.GITHUB_SHA) return validateRevision(env.GITHUB_SHA, 'GITHUB_SHA');
  return validateRevision(gitRevision(), 'git rev-parse HEAD');
}

function buildWranglerInvocation(revision, extraArgs = []) {
  return ['--yes', 'wrangler@4.45.0', 'deploy', ...extraArgs, '--var', `WORLD_SERVER_DEPLOYED_SHA:${revision}`];
}

function main() {
  const revision = resolveRevision();
  const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const result = spawnSync(command, buildWranglerInvocation(revision, process.argv.slice(2)), {
    stdio: 'inherit',
    env: process.env
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exitCode = result.status || 1;
}

if (require.main === module) {
  try { main(); } catch (error) {
    console.error(`[CLOUDFLARE_DEPLOY] FAIL ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { SHA_PATTERN, validateRevision, resolveRevision, buildWranglerInvocation };
