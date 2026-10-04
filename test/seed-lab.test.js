'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');

test('Seed Lab is a locked full-screen visual seed inspector', () => {
  const html = read('apps/seed-lab/index.html');
  const css = read('apps/seed-lab/styles.css');
  assert.match(html, /id="seed"/);
  assert.match(html, /id="idea"/);
  assert.match(html, /GOTHIC/);
  assert.match(html, /NEW YORK/);
  assert.match(html, /CHINA/);
  assert.match(html, /TOKYO/);
  assert.match(html, /FUTURE/);
  assert.match(css, /overflow:hidden/);
  assert.match(css, /body\{position:fixed;inset:0\}/);
  assert.match(css, /#view\{position:absolute;inset:0/);
  assert.match(css, /touch-action:none/);
});

test('Seed Lab uses canonical World Factory preview and Minecraft seed palette', () => {
  const html = read('apps/seed-lab/index.html');
  const client = read('apps/seed-lab/client.js');
  assert.match(client, /\/api\/world-factory/);
  assert.match(client, /action:'preview-seed'/);
  assert.match(client, /architecture\.minecraft/);
  assert.match(client, /blockAtlas\.palette/);
  assert.match(client, /drawImage/);
  assert.match(client, /cityPlan/);
  assert.match(client, /new THREE\.WebGLRenderer/);
  assert.match(client, /GLTFLoader/);
  assert.match(client, /mc\.assets\?\.mobs/);
  assert.match(html, /cryptopiy/);
  assert.doesNotMatch(client, /Math\.random/);
});

test('Seed Lab does not persist or mutate a world while comparing seeds', () => {
  const client = read('apps/seed-lab/client.js');
  assert.doesNotMatch(client, /action:'create'/);
  assert.doesNotMatch(client, /macro_place|macro_tick|player_save/);
});
