'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const appDir = path.join(root, 'apps', 'creature-editor-world');
const html = fs.readFileSync(path.join(appDir, 'index.html'), 'utf8');
const shell = fs.readFileSync(path.join(appDir, 'world-shell.js'), 'utf8');

test('standalone creature editor world keeps the 13-class editor contract', () => {
  for (const id of ['reptile','fish','dragon','dragon_fire','human','human_sword','human_torch','human_gun','croc_teeth','ship','steampunk_vehicle','creature','monster']) {
    assert.match(html, new RegExp(`value=["']${id}["']`), `missing creature class ${id}`);
  }
  assert.match(html, /id="saveUniversalBtn"/);
  assert.match(html, /id="exportAssetBtn"/);
  assert.match(html, /id="shaderPreset"/);
  assert.match(html, /id="skinPreset"/);
});
test('editor world has mobile controls, performance guard and lore shell', () => {
  const css = fs.readFileSync(path.join(appDir, 'world-shell.css'), 'utf8');
  assert.match(html, /setPixelRatio\(Math\.min\(window\.devicePixelRatio \|\| 1, 1\.75\)\)/);
  assert.match(html, /three\/addons\/controls\/OrbitControls\.js/);
  assert.match(css, /@media \(max-width:720px\)/);
  assert.match(shell, /Лаборатория Миметики/);
  assert.match(shell, /__CREATURE_EDITOR_WORLD__/);
});

test('editor world is registered and has complete canonical lore', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'data', 'app-release-registry.json'), 'utf8'));
  const lore = JSON.parse(fs.readFileSync(path.join(root, 'data', 'world-lore-v2.json'), 'utf8'));
  const meta = registry.apps['creature-editor-world'];
  assert.equal(meta.kind, 'world-tool');
  assert.equal(meta.worldMenu.show, true);
  const story = lore.worlds['creature-editor-world'];
  assert.ok(story?.headline && story?.lore && story?.history);
  const present = new Set(story.elements);
  for (const required of lore.requiredElements) assert.ok(present.has(required), `missing lore element ${required}`);
});
