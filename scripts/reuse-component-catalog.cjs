'use strict';

const fs = require('fs');
const path = require('path');
const {
  COMPONENT_ID,
  COMPONENT_VERSION,
  discoverRepositories
} = require('../lib/reuse/github-repository-discovery.cjs');

const root = path.resolve(__dirname, '..');
const statePath = path.join(root, 'architecture', 'reuse-state.json');

function readScope() {
  const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  const scope = state.scope;
  if (!scope || !Array.isArray(scope.public_repositories)) {
    throw new Error('Canonical repository scope is unavailable');
  }
  return {
    owner: state.owner,
    repositoriesTotal: scope.repositories_total,
    publicRepositories: scope.public_repositories,
    privateRepositoriesTotal: scope.private_repositories_total
  };
}

function main() {
  const scope = readScope();
  const catalog = discoverRepositories({
    owner: scope.owner,
    repositoriesTotal: scope.repositoriesTotal,
    publicRepositories: scope.publicRepositories,
    privateRepositoriesTotal: scope.privateRepositoriesTotal,
    generatedAt: process.env.REUSE_GENERATED_AT || undefined
  });

  if (catalog.component.id !== COMPONENT_ID || catalog.component.version !== COMPONENT_VERSION) {
    throw new Error('Discovery component identity mismatch');
  }
  if (catalog.repositories.some((repository) => repository.visibility !== 'public')) {
    throw new Error('Private repository record emission is forbidden');
  }

  process.stdout.write(`${JSON.stringify(catalog, null, 2)}\n`);
}

try {
  main();
} catch (error) {
  process.stderr.write(`reuse-component-catalog: ${error.message}\n`);
  process.exitCode = 1;
}
