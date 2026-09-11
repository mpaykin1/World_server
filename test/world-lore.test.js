'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  worldMenuWithLore,
  buildUniversalLoreGraph
} = require('../lib/world-lore');

const root = path.resolve(__dirname, '..');
const loreBible = JSON.parse(fs.readFileSync(path.join(root, 'data', 'world-lore-v2.json'), 'utf8').replace(/^\uFEFF/, ''));

test('existing authored lore remains authoritative and complete', () => {
  const menu = worldMenuWithLore('voxel-world', { show: true }, loreBible);
  assert.equal(menu.show, true);
  assert.equal(menu.loreGenerated, false);
  assert.ok(menu.headline);
  assert.ok(menu.lore);
  assert.deepEqual(new Set(menu.elements), new Set(loreBible.requiredElements));
});

test('a newly registered world receives deterministic lore and a canon connection automatically', () => {
  const first = worldMenuWithLore('new-test-world', { show: true }, loreBible);
  const second = worldMenuWithLore('new-test-world', { show: true }, loreBible);
  assert.deepEqual(first, second);
  assert.equal(first.loreGenerated, true);
  assert.equal(first.loreGenerator, 'world-server-deterministic-v1');
  assert.ok(first.headline.includes('New Test World'));
  assert.ok(first.lore.length > 40);
  assert.deepEqual(first.elements, loreBible.requiredElements);
  assert.equal(first.connections.length, 1);
  assert.ok(loreBible.worlds[first.connections[0].targetId]);
});

test('universal lore graph automatically bridges disconnected world groups into one canon', () => {
  const graph = buildUniversalLoreGraph([
    { id: 'alpha-world', title: 'Alpha', worldMenu: { connections: [{ targetId: 'beta-world', story: 'Alpha meets Beta.' }] } },
    { id: 'beta-world', title: 'Beta', worldMenu: { connections: [] } },
    { id: 'gamma-world', title: 'Gamma', worldMenu: { connections: [] } }
  ], { requiredElements: [], worlds: {} });
  assert.equal(graph.type, 'UniversalLoreGraph');
  assert.equal(graph.nodeCount, 3);
  assert.equal(graph.connected, true);
  assert.ok(graph.edges.some((edge) => edge.from === 'alpha-world' && edge.to === 'beta-world' && edge.generated === false));
  assert.ok(graph.edges.some((edge) => edge.relation === 'canon-bridge' && edge.generated === true));
});

test('universal lore graph never leaks connections to worlds outside its selected release scope', () => {
  const graph = buildUniversalLoreGraph([
    { id: 'public-world', title: 'Public', worldMenu: { connections: [{ targetId: 'hidden-world', story: 'Hidden clue.' }] } },
    { id: 'other-public-world', title: 'Other', worldMenu: { connections: [] } }
  ], { requiredElements: [], worlds: {} });
  assert.equal(graph.nodes.some((node) => node.id === 'hidden-world'), false);
  assert.equal(graph.edges.some((edge) => edge.to === 'hidden-world'), false);
  assert.equal(graph.connected, true);
});