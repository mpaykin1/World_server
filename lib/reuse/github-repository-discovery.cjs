'use strict';

const { spawnSync } = require('child_process');

const COMPONENT_ID = 'github-repository-discovery';
const COMPONENT_VERSION = '0.1.0';
const SAFE_NAME = /^[A-Za-z0-9._-]+$/;

function runGhJson(args, options = {}) {
  const result = spawnSync(options.binary || 'gh', args, {
    encoding: 'utf8',
    env: options.env || process.env,
    timeout: options.timeoutMs || 10_000,
    maxBuffer: options.maxBuffer || 2 * 1024 * 1024,
    windowsHide: true
  });

  if (result.error || result.status !== 0) {
    const error = new Error('GitHub CLI request failed');
    error.code = result.error?.code || `GH_EXIT_${result.status}`;
    throw error;
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    const error = new Error('GitHub CLI returned invalid JSON');
    error.code = 'GH_INVALID_JSON';
    throw error;
  }
}

function repositoryKind(repo, rootNames) {
  const names = new Set(rootNames.map((name) => name.toLowerCase()));
  const topics = new Set((repo.topics || []).map((topic) => String(topic).toLowerCase()));
  const language = String(repo.language || '').toLowerCase();

  if ([...names].some((name) => name.endsWith('.sb3')) || topics.has('scratch')) return 'scratch';
  if (names.has('project.godot') || topics.has('godot')) return 'godot';
  if (names.has('cmakelists.txt') || ['c', 'c++'].includes(language) || topics.has('wasm')) return 'cpp-wasm';
  if (topics.has('threejs') || topics.has('webgl')) return 'webgl';
  if (names.has('package.json')) return 'node-web';
  if (names.has('index.html')) return 'static-web';
  return 'unknown';
}

function compatibilityFor(kind) {
  return {
    threejs: kind === 'webgl' ? 'native' : 'adapter-required',
    webgl: kind === 'webgl' || kind === 'node-web' || kind === 'static-web' ? 'compatible' : 'adapter-required',
    scratch: kind === 'scratch' ? 'native' : 'separate-adapter',
    godot: kind === 'godot' ? 'native' : 'separate-adapter',
    cppWasm: kind === 'cpp-wasm' ? 'native' : 'separate-adapter'
  };
}

function normalizePublicNames(publicRepositories) {
  if (!Array.isArray(publicRepositories) || publicRepositories.length === 0) {
    throw new TypeError('publicRepositories must be a non-empty array');
  }

  const names = [...new Set(publicRepositories)];
  if (names.length !== publicRepositories.length || names.some((name) => !SAFE_NAME.test(name))) {
    throw new TypeError('publicRepositories contains a duplicate or unsafe name');
  }
  return names;
}

function readPublicRepository({ owner, name, runner }) {
  try {
    const repo = runner(['api', `repos/${owner}/${name}`]);
    const defaultBranch = repo.default_branch || null;
    let headSha = null;
    let rootNames = [];

    if (defaultBranch) {
      try {
        const commit = runner(['api', `repos/${owner}/${name}/commits/${encodeURIComponent(defaultBranch)}`]);
        headSha = commit.sha || null;
      } catch {
        headSha = null;
      }
    }

    try {
      const root = runner(['api', `repos/${owner}/${name}/contents`]);
      if (Array.isArray(root)) rootNames = root.map((entry) => entry.name).filter(Boolean).sort();
    } catch {
      rootNames = [];
    }

    const kind = repositoryKind(repo, rootNames);
    return {
      name,
      visibility: 'public',
      status: headSha ? 'READY' : 'UNRESOLVED',
      unresolvedReason: headSha ? null : 'HEAD_SHA_UNAVAILABLE',
      sourceUrl: repo.html_url || `https://github.com/${owner}/${name}`,
      defaultBranch,
      headSha,
      componentType: kind,
      primaryLanguage: repo.language || null,
      license: repo.license?.spdx_id || 'NOASSERTION',
      dependencies: rootNames.includes('package.json') ? ['package.json'] : [],
      entrypoints: rootNames.filter((entry) => ['index.html', 'package.json', 'project.godot', 'CMakeLists.txt'].includes(entry)),
      compatibility: compatibilityFor(kind)
    };
  } catch {
    return {
      name,
      visibility: 'public',
      status: 'UNRESOLVED',
      unresolvedReason: 'REPOSITORY_API_UNAVAILABLE',
      sourceUrl: `https://github.com/${owner}/${name}`,
      defaultBranch: null,
      headSha: null,
      componentType: 'unknown',
      primaryLanguage: null,
      license: 'NOASSERTION',
      dependencies: [],
      entrypoints: [],
      compatibility: compatibilityFor('unknown')
    };
  }
}

function discoverRepositories(options) {
  const owner = options?.owner;
  if (!SAFE_NAME.test(owner || '')) throw new TypeError('owner is required');

  const publicRepositories = normalizePublicNames(options.publicRepositories);
  const privateRepositoriesTotal = Number(options.privateRepositoriesTotal);
  if (!Number.isInteger(privateRepositoriesTotal) || privateRepositoriesTotal < 0) {
    throw new TypeError('privateRepositoriesTotal must be a non-negative integer');
  }

  const repositoriesTotal = publicRepositories.length + privateRepositoriesTotal;
  if (options.repositoriesTotal != null && repositoriesTotal !== options.repositoriesTotal) {
    throw new Error(`Repository scope mismatch: expected ${options.repositoriesTotal}, received ${repositoriesTotal}`);
  }

  const runner = options.runner || ((args) => runGhJson(args, options));
  const repositories = publicRepositories
    .map((name) => readPublicRepository({ owner, name, runner }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    schemaVersion: 1,
    component: { id: COMPONENT_ID, version: COMPONENT_VERSION },
    generatedAt: options.generatedAt || new Date().toISOString(),
    owner,
    repositoriesTotal,
    publicRepositoriesTotal: repositories.length,
    privateRepositoriesTotal,
    repositories,
    privacy: {
      privateIdentifiersCollected: false,
      privateRecordsEmitted: false,
      contract: 'Private repositories are represented only by an aggregate count.'
    }
  };
}

module.exports = {
  COMPONENT_ID,
  COMPONENT_VERSION,
  compatibilityFor,
  discoverRepositories,
  repositoryKind,
  runGhJson
};
