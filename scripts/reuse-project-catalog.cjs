'use strict';

const fs = require('fs');
const path = require('path');
const {
  discoverRepositories,
  runGhJson
} = require('../lib/reuse/github-repository-discovery.cjs');
const {
  COMPONENT_ID,
  COMPONENT_VERSION,
  discoverProjects,
  summarize
} = require('../lib/reuse/github-project-discovery.cjs');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'architecture', 'reuse-state.json');
const CATALOG_MODULE = Object.freeze({ id: COMPONENT_ID });

function readCanonicalInput() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const scope = state.scope;
  const audit = state.workflow?.route?.audit;
  if (!scope || !Array.isArray(scope.public_repositories)) {
    throw new Error('Canonical repository scope is unavailable');
  }
  if (!audit || !audit.public_heads) {
    throw new Error('Audited public repository heads are unavailable');
  }
  return {
    owner: state.owner,
    repositoriesTotal: scope.repositories_total,
    publicRepositories: scope.public_repositories,
    privateRepositoriesTotal: scope.private_repositories_total,
    auditedHeads: audit.public_heads,
    auditedAt: audit.checked_at
  };
}

function pinAuditedHeads(repositoryCatalog, input) {
  const expected = new Set(input.publicRepositories);
  const repositories = repositoryCatalog.repositories.map((repository) => {
    if (!expected.delete(repository.name)) {
      throw new Error(`Unexpected public repository: ${repository.name}`);
    }
    if (!Object.prototype.hasOwnProperty.call(input.auditedHeads, repository.name)) {
      throw new Error(`Missing audited HEAD: ${repository.name}`);
    }
    const auditedHead = input.auditedHeads[repository.name];
    return {
      ...repository,
      headSha: auditedHead,
      status: auditedHead ? 'READY' : 'EMPTY',
      unresolvedReason: null
    };
  });
  if (expected.size) {
    throw new Error(`Repository catalog omitted: ${[...expected].sort().join(', ')}`);
  }
  return { ...repositoryCatalog, repositories };
}

function markCatalogIntegration(projectCatalog) {
  for (const project of projectCatalog.projects) {
    project.module_coverage[COMPONENT_ID] = {
      status: 'integrated',
      reason: `Indexed by shared ${COMPONENT_ID} ${COMPONENT_VERSION}`
    };
  }
  projectCatalog.counters = summarize(projectCatalog.projects);
  return projectCatalog;
}

function assertComplete(projectCatalog, input) {
  const incomplete = projectCatalog.repositories.filter((repository) =>
    !['READY', 'EMPTY'].includes(repository.status));
  if (incomplete.length) {
    throw new Error(
      `Incomplete project coverage: ${incomplete.map((item) =>
        `${item.name}=${item.status}`).join(', ')}`
    );
  }
  if (projectCatalog.repositories.length !== input.publicRepositories.length) {
    throw new Error('Public repository coverage count mismatch');
  }
  if (projectCatalog.privateRepositoriesTotal !== input.privateRepositoriesTotal) {
    throw new Error('Private aggregate count mismatch');
  }
  if (projectCatalog.privacy.privateRecordsEmitted !== false) {
    throw new Error('Private repository record emission is forbidden');
  }
  if (projectCatalog.counters.remaining === 0 && projectCatalog.counters.verified < projectCatalog.counters.applicable) {
    throw new Error('fake-complete');
  }
  const ids = new Set(projectCatalog.projects.map((project) => project.project_id));
  if (ids.size !== projectCatalog.projects.length) {
    throw new Error('Duplicate project_id detected');
  }
  for (const project of projectCatalog.projects) {
    if (project.source_sha !== input.auditedHeads[project.repository]) {
      throw new Error(`Project source SHA is not audited: ${project.project_id}`);
    }
  }
}

function main() {
  const input = readCanonicalInput();
  const repositoryCatalog = discoverRepositories({
    owner: input.owner,
    repositoriesTotal: input.repositoriesTotal,
    publicRepositories: input.publicRepositories,
    privateRepositoriesTotal: input.privateRepositoriesTotal
  });
  const pinnedCatalog = pinAuditedHeads(repositoryCatalog, input);
  const projectCatalog = discoverProjects({
    repositoryCatalog: pinnedCatalog,
    modules: [{ id: 'shared-runtime', types: ['html-game', 'web-app', 'node-package', 'godot-project', 'scratch-project', 'cpp-wasm-project', 'python-tool', 'rust-project', 'roblox-project', 'tool'] }],
    runner: runGhJson
  });
  // Indexing a project does not mean integrating a runtime module.
  projectCatalog.counters = summarize(projectCatalog.projects);
  assertComplete(projectCatalog, input);
  projectCatalog.provenance = {
    audited_at: input.auditedAt,
    repository_heads: 'architecture/reuse-state.json#/workflow/route/audit/public_heads',
    module: `${COMPONENT_ID}@${COMPONENT_VERSION}`
  };
  process.stdout.write(`${JSON.stringify(projectCatalog, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`reuse-project-catalog: ${error.message}\n`);
  process.exitCode = 1;
}
