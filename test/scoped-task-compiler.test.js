'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const compiler = require('../lib/scoped-task-compiler');

const ROOT = path.resolve(__dirname, '..');

test('compileContext: level 1 finds an explicitly-named real file and puts it first', () => {
  const goal = 'In apps/ai3d-voxel-city/index.html, add viewport-fit=cover to the meta viewport tag.';
  const ctx = compiler.compileContext(ROOT, goal, 1);
  assert.equal(ctx.full, false);
  assert.equal(ctx.files[0], 'apps/ai3d-voxel-city/index.html');
  assert.ok(ctx.files.length <= 5, 'level 1 must stay small');
});

test('compileContext: level 1 never returns more files than the small cap', () => {
  const goal = 'fix the voxel world controls camera bug in apps and scripts and lib and data everywhere';
  const ctx = compiler.compileContext(ROOT, goal, 1);
  assert.ok(ctx.files.length <= 5);
});

test('compileContext: level 2 returns a bounded, larger set than level 1', () => {
  const goal = 'In apps/ai3d-voxel-city/index.html, add viewport-fit=cover to the meta viewport tag.';
  const l1 = compiler.compileContext(ROOT, goal, 1);
  const l2 = compiler.compileContext(ROOT, goal, 2);
  assert.ok(l2.files.length >= l1.files.length);
  assert.ok(l2.files.length <= 20);
  assert.ok(l2.files.includes('apps/ai3d-voxel-city/index.html'), 'level 2 must still include the explicit target file');
});

test('compileContext: level 3 is always the full-repo fallback with no file list', () => {
  const ctx = compiler.compileContext(ROOT, 'anything at all', 3);
  assert.equal(ctx.full, true);
  assert.deepEqual(ctx.files, []);
});

test('extractExplicitPaths: ignores a mentioned path that does not actually exist (no false confidence)', () => {
  const paths = compiler.extractExplicitPaths(ROOT, 'edit apps/this-app-does-not-exist-xyz/index.html please');
  assert.equal(paths.length, 0);
});

test('extractExplicitPaths: finds multiple real files mentioned in one goal', () => {
  const paths = compiler.extractExplicitPaths(ROOT, 'compare package.json and server.js for consistency');
  assert.ok(paths.includes('package.json'));
  assert.ok(paths.includes('server.js'));
});

test('keywordSearch: an empty/gibberish goal returns nothing rather than noise', () => {
  const results = compiler.keywordSearch(ROOT, 'zzqx flibbertigibbet qwzxjk', 8);
  assert.equal(results.length, 0);
});

test('compileContext: a goal with zero signal at level 1 still returns a small (possibly empty) set, never crashes', () => {
  const ctx = compiler.compileContext(ROOT, '', 1);
  assert.equal(ctx.full, false);
  assert.ok(Array.isArray(ctx.files));
});
