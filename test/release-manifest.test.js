'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveReleaseIdentity } = require('../api/release-manifest');

const CANONICAL_SHA = '1111111111111111111111111111111111111111';
const PROVIDER_SHA = '2222222222222222222222222222222222222222';
const BRIDGE_SHA = '3333333333333333333333333333333333333333';

test('release identity prefers explicit canonical source env over provider metadata', () => {
  const identity = resolveReleaseIdentity({
    WORLD_SERVER_SOURCE_SHA: CANONICAL_SHA,
    WORLD_SERVER_SOURCE_BRANCH: 'master',
    WORLD_SERVER_DEPLOY_ID: 'deploy-123',
    WORLD_SERVER_DEPLOY_PROVIDER: 'ai-studio',
    VERCEL_GIT_COMMIT_SHA: PROVIDER_SHA,
    COMMIT_REF: PROVIDER_SHA
  }, { sha: BRIDGE_SHA, branch: 'stale-branch' });

  assert.equal(identity.repository, 'mpaykin1/World_server');
  assert.equal(identity.sha, CANONICAL_SHA);
  assert.equal(identity.branch, 'master');
  assert.equal(identity.deployId, 'deploy-123');
  assert.equal(identity.provider, 'ai-studio');
  assert.equal(identity.authoritative, true);
});

test('release identity reuses existing bridge source metadata when provider env is absent', () => {
  const identity = resolveReleaseIdentity({}, {
    sha: BRIDGE_SHA,
    branch: 'master',
    deployId: 'bridge-deploy',
    provider: 'cloud-run'
  });

  assert.equal(identity.sha, BRIDGE_SHA);
  assert.equal(identity.branch, 'master');
  assert.equal(identity.deployId, 'bridge-deploy');
  assert.equal(identity.provider, 'cloud-run');
  assert.equal(identity.authoritative, true);
});

test('release identity fails closed when exact source SHA is unavailable', () => {
  const identity = resolveReleaseIdentity({ K_SERVICE: 'world-server' }, null);

  assert.equal(identity.sha, null);
  assert.equal(identity.branch, 'master');
  assert.equal(identity.provider, 'cloud-run');
  assert.equal(identity.authoritative, false);
  assert.equal(identity.evidence, 'source-sha-unavailable');
});

test('release identity rejects malformed or abbreviated source SHA evidence', () => {
  const malformed = resolveReleaseIdentity({
    WORLD_SERVER_SOURCE_SHA: 'b4db4e2',
    K_SERVICE: 'world-server'
  }, null);

  assert.equal(malformed.sha, null);
  assert.equal(malformed.authoritative, false);
  assert.equal(malformed.evidence, 'invalid-source-sha');
});
