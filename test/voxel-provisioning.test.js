'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveVoxelWorld, deriveTheme, seedFromWorldId } = require('../lib/voxel-provisioning');

test('deriveTheme detects snow/desert/forest keywords in title or scene, case-insensitively', () => {
  assert.equal(deriveTheme({ title: 'Снежное королевство', scene: '' }), 'snow');
  assert.equal(deriveTheme({ title: '', scene: 'В центре пустыни, среди песков' }), 'desert');
  assert.equal(deriveTheme({ title: 'Тёмный лес', scene: '' }), 'forest');
  assert.equal(deriveTheme({ title: 'СНЕЖНЫЙ ПУТЬ', scene: '' }), 'snow');
});

test('deriveTheme defaults to plains when no keyword matches', () => {
  assert.equal(deriveTheme({ title: 'Обычная история', scene: 'ничего особенного' }), 'plains');
  assert.equal(deriveTheme({}), 'plains');
});

test('seedFromWorldId is deterministic for the same id and differs for different ids', () => {
  assert.equal(seedFromWorldId('w-abc123456789'), seedFromWorldId('w-abc123456789'));
  assert.notEqual(seedFromWorldId('w-abc123456789'), seedFromWorldId('w-different1234'));
  assert.ok(seedFromWorldId('w-abc123456789') > 0);
});

test('deriveVoxelWorld produces a row shape matching the voxel_worlds schema', () => {
  const row = deriveVoxelWorld({ title: 'Ледяной путь', scene: 'холод и снег' }, 'w-abc123456789');
  assert.equal(row.id, 'w-abc123456789');
  assert.ok(Number.isInteger(row.seed) && row.seed > 0);
  assert.deepEqual(row.settings, {
    name: 'Ледяной путь',
    chunkSize: 16,
    minY: -16,
    maxY: 96,
    generatorVersion: 1,
    theme: 'snow'
  });
});

test('deriveVoxelWorld is fully deterministic: same spec + id always produces the identical row', () => {
  const spec = { title: 'Город из стекла', scene: 'жаркий песчаный простор' };
  const a = deriveVoxelWorld(spec, 'w-same0000000');
  const b = deriveVoxelWorld(spec, 'w-same0000000');
  assert.deepEqual(a, b);
});
