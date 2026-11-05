'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fixture = require('./fixtures/meta-game-vault.json');
const { createGameArtifact } = require('../lib/engines/game-builder.cjs');
const { verifyArtifact } = require('../lib/engines/artifact.cjs');
const commit = '99e30d546ba0cc911448f5ff9dfc67d8a5c5ea9c';
const args = () => ({ gameCard: structuredClone(fixture.gameCard), randomSeed: fixture.randomSeed, sourceCommit: commit });
test('canonical seven engines create original playable WebGL2 HTML with real rules and GLSL', () => {
  const a = createGameArtifact(args()), b = createGameArtifact(args());
  assert.ok(verifyArtifact(a));
  assert.deepEqual(a, b);
  assert.match(a.files['index.html'], /<canvas id="screen"/);
  assert.match(a.files['game.js'], /window\.EngineMechanics/);
  assert.match(a.files['game.js'], /simulatePhysicsStep/);
  assert.match(a.files['game.js'], /finishMechanics/);
  assert.match(a.files['game.js'], /getContext\('webgl2'/);
  const pipeline = JSON.parse(a.files['data/pipeline.json']);
  assert.deepEqual(pipeline.errors, []);
  assert.equal(pipeline.steps.length, 7);
  assert.equal(pipeline.outputs.story.scenes.length, 6);
  assert.equal(pipeline.outputs.mechanics.world.solids.length, fixture.gameCard.world.solids.length);
  assert.match(a.files['shaders/atmosphere-fragment.glsl'], /^#version 300 es/);
  assert.equal(a.manifest.validation.browser, 'not_run');
  assert.equal(a.manifest.validation.rights, 'not_verified');
  assert.equal(a.manifest.validation.publication, 'not_published');
  const provenance = JSON.parse(a.files['data/provenance.json']);
  assert.equal(provenance.sourceCommitVerified, false);
  assert.deepEqual(provenance.externalAssets, []);
  assert.equal(Object.keys(provenance.components).length, 5);
});
test('authored geometry is mandatory and cannot be replaced with invented floor or fake scenes', () => {
  for (const change of [
    g => { delete g.world.solids; },
    g => { g.world.solids = []; },
    g => { g.world.spawn = { x: 999999, y: 0, z: 0 }; },
    g => { g.world.sceneMarkers[3].id = 'other-scene'; },
    g => { g.world.solids[0].layer = 'not-in-physics'; },
    g => { g.world.solids[0].min.x = g.world.solids[0].max.x; }
  ]) {
    const input = args();change(input.gameCard);
    assert.throws(() => createGameArtifact(input));
  }
});
test('unverified third-party assets and incomplete engine stages fail closed', () => {
  const input = args();input.gameCard.referenceIds = ['observer-npcs'];
  assert.throws(() => createGameArtifact(input), /failed|Reference assets|pipeline/i);
  const other = args();other.gameCard.engines_enabled = ['dramaturgy'];
  assert.throws(() => createGameArtifact(other));
});
test('artifact cannot be modified without invalidating SHA-256 manifest', () => {
  const a = createGameArtifact(args());
  a.files['game.js'] += '\n// change';
  assert.equal(verifyArtifact(a), false);
});
