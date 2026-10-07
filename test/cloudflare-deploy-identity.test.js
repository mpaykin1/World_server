'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveRevision,
  buildWranglerInvocation
} = require('../scripts/deploy-cloudflare-exact-sha.cjs');

const workersSha = 'a'.repeat(40);
const githubSha = 'b'.repeat(40);
const gitSha = 'c'.repeat(40);

test('Cloudflare deploy identity prefers the Workers Builds exact commit SHA', () => {
  assert.equal(resolveRevision({ WORKERS_CI_COMMIT_SHA: workersSha, GITHUB_SHA: githubSha }, () => gitSha), workersSha);
  assert.equal(resolveRevision({ GITHUB_SHA: githubSha }, () => gitSha), githubSha);
  assert.equal(resolveRevision({}, () => gitSha), gitSha);
});

test('Cloudflare deploy identity fails closed on a non-Git build revision', () => {
  assert.throws(
    () => resolveRevision({ WORKERS_CI_COMMIT_SHA: 'not-a-git-sha' }, () => gitSha),
    /exact 40-character Git SHA/
  );
});

test('Cloudflare deploy wrapper always stamps the runtime revision', () => {
  assert.deepEqual(
    buildWranglerInvocation(workersSha, ['--name', 'world-server-preview']),
    ['--yes', 'wrangler@4.45.0', 'deploy', '--name', 'world-server-preview', '--var', `WORLD_SERVER_DEPLOYED_SHA:${workersSha}`]
  );
});
