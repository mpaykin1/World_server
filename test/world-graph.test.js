'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ingestManifests, normalizeManifest, publicWorlds } = require('../lib/world-graph');

const release = { apps: {
  alpha: { visible: true, status: 'certified' },
  beta: { visible: false, status: 'quarantine' }
} };

function manifest(overrides = {}) {
  return {
    id: 'alpha-v1', patchFamily: 'alpha', version: '1.0.0', releaseAppId: 'alpha',
    title: 'Alpha', description: 'Alpha world', lore: 'Alpha lore', capabilities: ['portal'],
    history: [{ version: '1.0.0', summary: 'Initial' }], portals: [], source: { commit: 'abc', path: 'apps/alpha/' }, ...overrides
  };
}

test('normalization creates a deterministic revision identity and hash', () => {
  const one = normalizeManifest(manifest());
  const two = normalizeManifest(manifest());
  assert.equal(one.revisionId, 'alpha@1.0.0');
  assert.equal(one.manifestHash, two.manifestHash);
});

test('ingestion is idempotent and preserves later revisions as history', () => {
  const first = ingestManifests([manifest(), manifest({ id: 'alpha-v2', version: '2.0.0', history: [{ version: '1.0.0', summary: 'Initial' }, { version: '2.0.0', summary: 'Second revision' }] })], release);
  const second = ingestManifests([manifest(), manifest(), manifest({ id: 'alpha-v2', version: '2.0.0', history: [{ version: '1.0.0', summary: 'Initial' }, { version: '2.0.0', summary: 'Second revision' }] })], release);
  assert.deepEqual(second, first);
  assert.equal(first.worlds[0].revisions.length, 2);
  assert.equal(first.worlds[0].latestRevisionId, 'alpha@2.0.0');
});

test('conflicting duplicate revisions fail closed', () => {
  assert.throws(() => ingestManifests([manifest(), manifest({ description: 'tampered' })], release), /Conflicting duplicate revision/);
});

test('dangling portals fail closed and public output respects deny-by-default release state', () => {
  assert.throws(() => ingestManifests([manifest({ portals: [{ targetWorldId: 'missing', label: 'Missing' }] })], release), /Dangling portal/);
  const graph = ingestManifests([manifest(), manifest({ id: 'beta-v1', patchFamily: 'beta', releaseAppId: 'beta', title: 'Beta' })], release);
  assert.deepEqual(publicWorlds(graph).map((world) => world.patchFamily), ['alpha']);
});
