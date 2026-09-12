'use strict';

const fs = require('fs');
const path = require('path');
const { sendJson, methodNotAllowed, withErrors } = require('../lib/http');

const SOURCE_REPO = 'mpaykin1/World_server';
const DEFAULT_BRANCH = 'master';
const FULL_GIT_SHA_RE = /^[0-9a-f]{40}$/i;

function firstNonEmpty(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function readBridgeSource(rootDir = path.resolve(__dirname, '..')) {
  const candidates = [
    path.join(rootDir, 'AI_STUDIO_BRIDGE_SOURCE.json'),
    path.join(rootDir, 'data', 'AI_STUDIO_BRIDGE_SOURCE.json')
  ];

  for (const candidate of candidates) {
    try {
      if (!fs.existsSync(candidate)) continue;
      const parsed = JSON.parse(fs.readFileSync(candidate, 'utf8'));
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

function resolveReleaseIdentity(env = process.env, bridgeSource = readBridgeSource()) {
  const source = bridgeSource || {};
  const rawSha = firstNonEmpty(
    env.WORLD_SERVER_SOURCE_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
    env.COMMIT_REF,
    env.GITHUB_SHA,
    source.sha,
    source.commit,
    source.sourceSha,
    source.source_sha
  );
  const sha = rawSha && FULL_GIT_SHA_RE.test(rawSha) ? rawSha.toLowerCase() : null;
  const branch = firstNonEmpty(
    env.WORLD_SERVER_SOURCE_BRANCH,
    env.VERCEL_GIT_COMMIT_REF,
    env.BRANCH,
    source.branch,
    source.sourceBranch,
    source.source_branch,
    DEFAULT_BRANCH
  );
  const deployId = firstNonEmpty(
    env.WORLD_SERVER_DEPLOY_ID,
    env.VERCEL_DEPLOYMENT_ID,
    env.DEPLOY_ID,
    env.K_REVISION,
    source.deployId,
    source.deploy_id
  );
  const provider = firstNonEmpty(
    env.WORLD_SERVER_DEPLOY_PROVIDER,
    env.VERCEL ? 'vercel' : null,
    env.NETLIFY ? 'netlify' : null,
    env.K_SERVICE ? 'cloud-run' : null,
    source.provider
  );

  return {
    schemaVersion: 1,
    repository: SOURCE_REPO,
    branch,
    sha,
    deployId,
    provider,
    authoritative: Boolean(sha),
    evidence: sha ? 'runtime-source-identity' : (rawSha ? 'invalid-source-sha' : 'source-sha-unavailable')
  };
}

module.exports = withErrors(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, ['GET']);
  const identity = resolveReleaseIdentity();
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  sendJson(res, identity.authoritative ? 200 : 503, identity);
});

module.exports.resolveReleaseIdentity = resolveReleaseIdentity;
module.exports.readBridgeSource = readBridgeSource;
