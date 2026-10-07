'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const assetsIgnore = fs.readFileSync(path.join(root, '.assetsignore'), 'utf8');
const creatureRuntime = fs.readFileSync(path.join(root, 'shared', 'creature-visual-runtime.mjs'), 'utf8');
const creaturePolicyPath = path.join(root, 'data', 'creature-lod-policy.json');

test('Cloudflare publishes every data asset required by the creature runtime', () => {
  assert.match(creatureRuntime, /fetch\('\/data\/creature-lod-policy\.json'/);
  assert.ok(fs.existsSync(creaturePolicyPath), 'tracked creature LOD policy must exist');

  const publishedDataFiles = assetsIgnore
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('!data/') && line !== '!data/')
    .sort();

  assert.deepEqual(publishedDataFiles, [
    '!data/creature-lod-policy.json',
    '!data/world-graph-index.json',
  ]);
});

test('published creature LOD policy keeps the runtime contract', () => {
  const policy = JSON.parse(fs.readFileSync(creaturePolicyPath, 'utf8'));
  assert.equal(policy.system, 'CREATURE_LOD_POLICY');
  assert.deepEqual(policy.tierOrder, ['full', 'high', 'medium', 'low']);
  for (const tier of policy.tierOrder) {
    assert.equal(typeof policy.tiers?.[tier]?.maxDistance, 'number', tier);
    assert.equal(typeof policy.tiers?.[tier]?.tickRate, 'number', tier);
  }
});
