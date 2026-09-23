'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  detectMacroTypes, createEmergenceStateFromIdea, placeMacroEntity, advanceEmergence, buildEmergenceState
} = require('../lib/world-emergence');

test('idea parser understands city + nature as interacting macro entities', () => {
  assert.deepEqual(detectMacroTypes('ребенок ставит город рядом с природой'), ['city','forest']);
  const state = createEmergenceStateFromIdea({ idea:'город и природа рядом', seed:123 });
  assert.equal(state.entities.length, 2);
  assert.equal(state.relations.length, 1);
  assert.equal(state.relations[0].kind, 'living_frontier');
  assert.ok(state.features.some(x => x.kind === 'road'));
  assert.ok(state.interestScore >= 0.7);
});

test('emergence is deterministic for the same idea and seed', () => {
  const a = createEmergenceStateFromIdea({ idea:'город лес река', seed:99 });
  const b = createEmergenceStateFromIdea({ idea:'город лес река', seed:99 });
  assert.deepEqual(a, b);
});

test('placing a second large entity creates a relation and resets visible growth to stage one', () => {
  let state = buildEmergenceState({ entities:[{type:'city',x:0,z:0}], seed:7 });
  state = placeMacroEntity(state,{type:'forest',x:45,z:0,ownerId:'kid'},7);
  assert.equal(state.entities.length,2);
  assert.equal(state.growthStage,1);
  assert.equal(state.relations.length,1);
  assert.equal(state.features.length,1);
  assert.equal(state.features[0].stage,1);
});

test('advancing emergence progressively reveals more consequences without changing entities', () => {
  let state = createEmergenceStateFromIdea({ idea:'город и вулкан', seed:4 });
  const before = state.entities;
  const n1 = state.features.length;
  state = advanceEmergence(state,4);
  state = advanceEmergence(state,4);
  assert.deepEqual(state.entities,before);
  assert.ok(state.features.length > n1);
  assert.ok(state.growthStage >= 4);
  assert.ok(state.features.some(x => x.kind === 'obsidian_workshop' || x.kind === 'lava_wall'));
});

test('voxel client is wired to emergence runtime and server macro actions', () => {
  const root=path.resolve(__dirname,'..');
  const client=fs.readFileSync(path.join(root,'apps','voxel-world','client.js'),'utf8');
  const html=fs.readFileSync(path.join(root,'apps','voxel-world','index.html'),'utf8');
  const api=fs.readFileSync(path.join(root,'api','voxel.js'),'utf8');
  assert.match(html,/world-emergence-runtime\.js/);
  assert.match(client,/macro_place/);
  assert.match(client,/macro_tick/);
  assert.match(client,/fetch\('\/api\/emergence'/);
  assert.match(client,/WorldEmergenceRuntime/);
  assert.match(api,/actionMacroPlace/);
  assert.match(api,/actionMacroTick/);
});
