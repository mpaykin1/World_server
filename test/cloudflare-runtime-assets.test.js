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

// Game builds are served by the Cloudflare worker, game sources are not. Netlify deploys
// failed from 2026-10-15, and the merged «Остров сумерек» had no live link anywhere:
// .assetsignore published apps/, shared/ and assets/, but nothing under games/.
test('Cloudflare publishes game builds (games/*/dist) and keeps game sources private', () => {
  const lines = assetsIgnore.split(/\r?\n/).map((line) => line.trim());
  for (const rule of ['!games/', '!games/*/', '!games/*/dist/', '!games/*/dist/**']) {
    assert.ok(lines.includes(rule), `${rule} missing from .assetsignore`);
  }
  assert.ok(!lines.some((line) => /^!games\/(\*\*|\*\/\*\*)$/.test(line)), 'game sources must stay unpublished');

  // git applies the same gitignore rules wrangler uses for .assetsignore.
  const { spawnSync } = require('node:child_process');
  const ignored = (file) => spawnSync('git', ['-c', `core.excludesFile=${path.join(root, '.assetsignore')}`,
    'check-ignore', '--no-index', '-q', file], { cwd: root }).status === 0;
  assert.equal(ignored('games/ostrov-sumerek/dist/index.html'), false, 'game build must be published');
  assert.equal(ignored('games/ostrov-sumerek/engine/68_foes.js'), true, 'game source must stay private');
  assert.equal(ignored('games/ostrov-sumerek/tools/check.py'), true, 'game tools must stay private');
  assert.equal(ignored('apps/catalog/index.html'), false);
  assert.equal(ignored('cloudflare-worker.js'), true);
});
