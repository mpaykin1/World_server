'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildBlueprint } = require('../lib/narrative-blueprint');

test('buildBlueprint matches the client app.js finish() logic for a create journey', () => {
  const blueprint = buildBlueprint({ story: 'Жила-была история про свет', storyDesire: 'вырваться', storySource: 'тишина', format: 'game' });
  assert.equal(blueprint.title, 'Жила-была история про свет');
  assert.equal(blueprint.mode, 'Игра');
  assert.match(blueprint.scene, /вырваться/);
  assert.match(blueprint.scene, /тишина/);
});

test('buildBlueprint falls back to defaults exactly like the client when fields are empty', () => {
  const blueprint = buildBlueprint({});
  assert.equal(blueprint.title, 'Новая история');
  assert.equal(blueprint.mode, 'Формат будет выбран автоматически');
  assert.match(blueprint.scene, /найти направление/);
  assert.match(blueprint.scene, /неизвестность/);
});

test('buildBlueprint titles a join journey as a branch of its source', () => {
  const blueprint = buildBlueprint({ story: 'ignored for join' }, { journey: 'join', sourceTitle: 'Voxel Gothic Steampunk World' });
  assert.equal(blueprint.title, 'Voxel Gothic Steampunk World — альтернативная ветка');
});

test('buildBlueprint truncates long story text to 55 chars, matching the client', () => {
  const longStory = 'A'.repeat(100);
  const blueprint = buildBlueprint({ story: longStory });
  assert.equal(blueprint.title.length, 55);
});

test('buildBlueprint mode covers all three format choices plus the unset default', () => {
  assert.equal(buildBlueprint({ format: 'story' }).mode, 'Интерактивный рассказ');
  assert.equal(buildBlueprint({ format: 'both' }).mode, 'Игра + интерактивный рассказ');
});
