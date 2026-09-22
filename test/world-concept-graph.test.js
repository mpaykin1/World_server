'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createEmergenceStateFromIdea, advanceEmergence } = require('../lib/world-emergence');

const graph = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'world-concept-graph.json'), 'utf8'));

function relation(id) {
  return graph.relations.find(item => item.id === id);
}

function advanceToFive(state, seed) {
  let current = state;
  while (current.growthStage < 5) current = advanceEmergence(current, seed);
  return current;
}

test('concept graph relations are provenance-backed and singly owned', () => {
  assert.equal(graph.metrics.materialRelations, graph.relations.length);
  assert.equal(new Set(graph.relations.map(item => item.id)).size, graph.relations.length);
  for (const item of graph.relations) {
    assert.ok(item.owner);
    assert.ok(item.test);
    assert.ok(graph.evidence.some(evidence => evidence.supports === item.id));
  }
});

test('forest-volcano prediction closes through the existing emergence engine', () => {
  const item = relation('forest-volcano-disturbance-succession');
  const state = advanceToFive(createEmergenceStateFromIdea({ idea: 'forest volcano', seed: 41 }), 41);
  assert.equal(state.relations[0].kind, item.capability);
  const kinds = new Set(state.features.map(feature => feature.kind));
  for (const expected of item.observableManifestations) assert.ok(kinds.has(expected), expected);
});

test('river counterfactual does not produce volcanic disturbance succession', () => {
  const state = advanceToFive(createEmergenceStateFromIdea({ idea: 'forest river', seed: 41 }), 41);
  assert.notEqual(state.relations[0].kind, 'burn_and_regrow');
  const kinds = new Set(state.features.map(feature => feature.kind));
  assert.equal(kinds.has('ash_field'), false);
  assert.equal(kinds.has('burnt_grove'), false);
  assert.equal(kinds.has('young_forest'), false);
});

test('unknown scenario inventory stays explicitly unknown instead of fabricating coverage', () => {
  assert.equal(graph.scenarioContract.expectedNodeCount, 62);
  assert.equal(graph.scenarioContract.canonicalNodeInventory, 'UNKNOWN');
  assert.equal(graph.metrics.scenarioNodeCoverage, 'UNKNOWN');
});

const scenario = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'living-world-scenario.json'), 'utf8'));

test('62-step scenario inventory is structurally canonical without invented wording', () => {
  assert.equal(scenario.expectedNodeCount, 62);
  assert.equal(scenario.steps.length, 62);
  assert.deepEqual(scenario.steps.map(item => item.id), Array.from({ length: 62 }, (_, index) => index + 1));
  const recovered = scenario.steps.filter(item => item.status === 'RECOVERED_FROM_USER_SCENARIO');
  const unknown = scenario.steps.filter(item => item.status === 'UNKNOWN_PENDING_EXACT_RECOVERY');
  assert.equal(recovered.length, 23);
  assert.equal(unknown.length, 39);
  assert.equal(scenario.steps[0].text, 'Добро пожаловать! Этот мир живой.');
  assert.equal(scenario.steps[61].text, 'Теперь решаешь ты.');
  assert.ok(unknown.every(item => item.text === null));
});

test('scenario recovery coverage is count-derived and honest', () => {
  const recovered = scenario.steps.filter(item => item.text !== null).length;
  assert.equal(recovered, 23);
  assert.equal(Number((recovered / scenario.expectedNodeCount * 100).toFixed(1)), 37.1);
});
