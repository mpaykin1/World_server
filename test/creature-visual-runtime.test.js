'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }

test('dark void scene exposes the live Creature Factory runtime', () => {
  const client = read('apps/dark-void-scene/client.js');
  assert.match(client, /CreatureWorld/);
  assert.match(client, /creatureWorld\.spawn\(26\)/);
  assert.match(client, /creatureWorld\.update\(now, dt\)/);
  assert.match(client, /window\.CreatureFactoryLive/);
});

test('visual runtime preserves all 13 editor categories and production LOD policy link', () => {
  const runtime = read('shared/creature-visual-runtime.mjs');
  const categories = ['reptile','croc_teeth','fish','dragon','dragon_fire','human','human_sword','human_torch','human_gun','ship','steampunk_vehicle','creature','monster'];
  for (const category of categories) assert.ok(runtime.includes(`'${category}'`), category);
  assert.match(runtime, /creature-lod-policy\.json/);
  assert.match(runtime, /microDetail/);
  assert.match(runtime, /damage\(record/);
  assert.match(runtime, /respawnAt/);
});
