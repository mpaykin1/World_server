'use strict';
// Guard the player-facing contract while Graphics integrates the stacked fix.
// This test intentionally needs no browser, credentials or paid AI service.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../apps/voxel-world/genie-strategy.mjs'), 'utf8');

test('Genie renders only certified server cards and no fabricated fallback choices', () => {
  assert.match(source, /Array\.isArray\(j\.cards\)\s*\?\s*j\.cards\s*:\s*\[\]/);
  assert.doesNotMatch(source, /j\.options/);
  assert.doesNotMatch(source, /\.\.\.FALLBACK_CARDS/);
  assert.match(source, /cards\.replaceChildren\(\)/);
  assert.match(source, /o\.plan\?\.cost/);
  assert.match(source, /o\.plan\?\.buildTicks/);
  assert.match(source, /heading\.textContent\s*=/);
});

test('Genie hydrates saved authoritative world and does not fake cards on API failure', () => {
  assert.match(source, /Promise\.all\(\[chain\('genie-options'\),chain\('preview-plan'/);
  assert.match(source, /renderWorld\(snapshot\.world\)/);
  assert.match(source, /catch\(e\)\{cards\.replaceChildren\(\);say\(/);
  assert.match(source, /chain\('commit-plan'/);
  assert.match(source, /chain\('tick'/);
  assert.match(source, /expectedRevision:revision/);
});
