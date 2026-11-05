'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGenerationService } = require('../lib/engines/generation-service.cjs');
const fixture = require('./fixtures/meta-game-vault.json');
const make = () => createGenerationService({sourceCommit:'a'.repeat(40)});
test('real local create/validate/preview preserves package and honest acceptance status', () => {
  const s=make(), r=s.createGame(fixture);
  assert.equal(r.integrity,true);
  assert.equal(r.browser,'not_run');
  assert.equal(r.publication,'not_published');
  assert.equal(s.validateGame(r.artifact_id).integrity,true);
  const p=s.previewGame(r.artifact_id);
  assert.ok(p.package.files['game.js'].length>1000);
  p.package.files['game.js']='tampered';
  p.package.manifest.game_id='tampered';
  assert.equal(s.validateGame(r.artifact_id).integrity,true);
  assert.notEqual(s.previewGame(r.artifact_id).package.files['game.js'],'tampered');
  assert.equal(s.createGame(fixture).artifact_id,r.artifact_id);
});
test('reject caller source, paths, oversized data and unknown artifacts', () => {
  const s=make();
  assert.throws(()=>createGenerationService({sourceCommit:'main'}));
  for(const input of [{...fixture,sourceCommit:'b'.repeat(40)},
    {...fixture,outputPath:'../outside'}, {...fixture,recentGames:Array(9).fill({})},
    {...fixture,gameCard:{...fixture.gameCard,extra:'x'.repeat(65536)}}])
    assert.throws(()=>s.createGame(input));
  assert.throws(()=>s.previewGame('../index.html'),/unavailable/);
  assert.throws(()=>s.validateGame('0'.repeat(64)),/unavailable/);
});
test('bounded cache evicts oldest package and keeps remaining artifacts valid', () => {
  const s=make(), ids=[];
  for(let i=0;i<5;i++)ids.push(s.createGame({...fixture,randomSeed:100+i}).artifact_id);
  assert.equal(new Set(ids).size,5);
  assert.throws(()=>s.validateGame(ids[0]),/unavailable/);
  assert.equal(s.validateGame(ids[4]).integrity,true);
});
