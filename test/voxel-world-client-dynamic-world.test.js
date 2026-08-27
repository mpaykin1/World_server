'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Structural regression guard for apps/voxel-world/client.js's dynamic-
// world-id support. The file imports three.js and drives real WebGL/DOM at
// module load time, which makes a full behavioral sandbox (the approach
// used for apps/improve-world-home/public/app.js, which has no such
// dependencies) impractical here -- these assertions instead pin the exact
// source properties that matter: every world-scoped API call and the
// realtime channel must use the dynamic `worldId`, not a re-introduced
// hardcoded 'main', while the fallback default stays 'main' so the
// original single-world experience is unchanged for anyone who doesn't
// pass a ?world= param.

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'apps', 'voxel-world', 'client.js'), 'utf8');

test('worldId is derived from the ?world= query param, falling back to "main"', () => {
  assert.match(SOURCE, /const worldId=new URLSearchParams\(location\.search\)\.get\('world'\)\|\|'main';/);
});

test('every world-scoped API call and the realtime channel use the dynamic worldId, not a hardcoded string', () => {
  assert.match(SOURCE, /api\('chunks',\{chunks:need,worldId\}\)/);
  assert.match(SOURCE, /api\('set_block',\{worldId,/);
  assert.match(SOURCE, /api\('player_save',\{worldId,/);
  assert.match(SOURCE, /api\('init',\{worldId\}\)/);
  assert.match(SOURCE, /sb\.channel\(`voxel:\$\{worldId\}`/);
  // No lingering hardcoded worldId:'main' anywhere in an API call.
  assert.doesNotMatch(SOURCE, /worldId:\s*'main'/);
});

test("the theme-biased biome table covers all four biomes with an unbiased 'plains' default", () => {
  assert.match(SOURCE, /const THEME_BIOME_BIAS=\{/);
  for (const theme of ['desert', 'snow', 'forest', 'plains']) {
    assert.match(SOURCE, new RegExp(`${theme}:\\{desert:[^,]+,snow:[^,]+,forest:[^}]+\\}`));
  }
  assert.match(SOURCE, /plains:\{desert:0,snow:0,forest:0\}/);
});

test('biomeAt applies the theme bias instead of using fixed thresholds directly', () => {
  assert.match(SOURCE, /const bias=THEME_BIOME_BIAS\[worldTheme\]\|\|THEME_BIOME_BIAS\.plains;/);
  assert.match(SOURCE, /t>\.72\+bias\.desert/);
  assert.match(SOURCE, /t<\.22\+bias\.snow/);
  assert.match(SOURCE, /m>\.62\+bias\.forest/);
});

test('worldTheme is set from the real init response, not left at its default for every world', () => {
  assert.match(SOURCE, /worldTheme=String\(init\.world\?\.settings\?\.theme\|\|'plains'\);/);
});
