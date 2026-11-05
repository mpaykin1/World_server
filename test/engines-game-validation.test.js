'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { packArtifact } = require('../lib/engines/artifact.cjs');
const { validateGameArtifact } = require('../lib/engines/game-validation.cjs');
const { createGameArtifact } = require('../lib/engines/game-builder.cjs');
const fixture = require('./fixtures/meta-game-vault.json');
const sourceCommit = 'a'.repeat(40);
const build = () => createGameArtifact({ ...fixture, sourceCommit });
test('real builder artifact is structurally valid without claiming release acceptance', () => {
  const a = build(), result = validateGameArtifact(a, { sourceCommit });
  assert.equal(result.integrity, true);
  assert.equal(result.browser, 'not_run');
  assert.equal(result.rights, 'not_verified');
  assert.equal(result.publication, 'not_published');
  assert.equal(validateGameArtifact(a, { sourceCommit: 'b'.repeat(40) }).integrity, false);
});
test('corrupt bytes and absent trace fail closed', () => {
  const a = build(); a.files['game.js'] += 'changed';
  assert.equal(validateGameArtifact(a).integrity, false);
  assert.equal(validateGameArtifact(null).integrity, false);
  const b = build(); delete b.files['data/pipeline.json'];
  assert.equal(validateGameArtifact(b).integrity, false);
});
test('repackaged conflicting provenance or pipeline is rejected', () => {
  const a = build();
  const pipeline = JSON.parse(a.files['data/pipeline.json']);
  const files = { ...a.files };
  const p = JSON.parse(files['data/provenance.json']);
  p.sourceCommit = 'b'.repeat(40);
  files['data/provenance.json'] = JSON.stringify(p);
  assert.equal(validateGameArtifact(packArtifact({gameId:a.manifest.game_id,
    sourceCommit,pipelineResult:pipeline,files})).integrity, false);
  const mismatch = {...a.files, 'data/pipeline.json': JSON.stringify({...pipeline,seed:'different'})};
  assert.equal(validateGameArtifact(packArtifact({gameId:a.manifest.game_id,
    sourceCommit,pipelineResult:pipeline,files:mismatch})).integrity, false);
  p.sourceCommit = sourceCommit; p.externalAssets = ['unlicensed'];
  files['data/provenance.json'] = JSON.stringify(p);
  assert.equal(validateGameArtifact(packArtifact({gameId:a.manifest.game_id,
    sourceCommit,pipelineResult:pipeline,files})).integrity, false);
});
