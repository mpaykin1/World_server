'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { deriveVoxelWorld, deriveTheme, deriveHeightScale, seedFromWorldId, THEME_PALETTE, THEME_TREE_DENSITY } = require('../lib/voxel-provisioning');

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

test('deriveVoxelWorld produces a row shape matching the voxel_worlds schema, including palette/atmosphere/density', () => {
  const row = deriveVoxelWorld({ title: 'Ледяной путь', scene: 'холод и снег' }, 'w-abc123456789');
  assert.equal(row.id, 'w-abc123456789');
  assert.ok(Number.isInteger(row.seed) && row.seed > 0);
  assert.deepEqual(row.settings, {
    name: 'Ледяной путь',
    chunkSize: 16,
    minY: -16,
    maxY: 96,
    generatorVersion: 2,
    theme: 'snow',
    skyTint: THEME_PALETTE.snow.skyTint,
    fogNear: THEME_PALETTE.snow.fogNear,
    fogFar: THEME_PALETTE.snow.fogFar,
    treeDensity: THEME_TREE_DENSITY.snow,
    heightScale: 1
  });
});

test('deriveHeightScale reflects the questionnaire\'s own tension/conflict answers embedded in the scene text', () => {
  assert.equal(deriveHeightScale({ scene: 'История начинает замечать тебя. Она хочет вырваться. Источник напряжения: скрытый конфликт и тревога.' }), 1.5);
  assert.equal(deriveHeightScale({ scene: 'Здесь царят гармония и спокойствие.' }), 0.6);
  assert.equal(deriveHeightScale({ scene: 'Ничего особенного не происходит.' }), 1);
});

test('each theme gets a distinct palette/tree-density so worlds visibly differ, not just by name', () => {
  const themes = ['snow', 'desert', 'forest', 'plains'];
  const tints = new Set(themes.map((t) => THEME_PALETTE[t].skyTint));
  const densities = new Set(themes.map((t) => THEME_TREE_DENSITY[t]));
  assert.equal(tints.size, 4, 'every theme must have its own sky tint');
  assert.equal(densities.size, 4, 'every theme must have its own tree density');
});

test('deriveVoxelWorld is fully deterministic: same spec + id always produces the identical row', () => {
  const spec = { title: 'Город из стекла', scene: 'жаркий песчаный простор' };
  const a = deriveVoxelWorld(spec, 'w-same0000000');
  const b = deriveVoxelWorld(spec, 'w-same0000000');
  assert.deepEqual(a, b);
});
