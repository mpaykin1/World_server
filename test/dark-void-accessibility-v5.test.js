'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(repo,'apps','dark-void-scene','index.html'),'utf8');
const client=fs.readFileSync(path.join(repo,'apps','dark-void-scene','client.js'),'utf8');

test('Dark Void exposes an English screen-reader status and semantic controls help',()=>{
  assert.match(html,/html lang="en"/);
  assert.match(html,/id="dvLoading" role="status" aria-live="polite"/);
  assert.match(html,/id="dvHelp" role="note" aria-label="Controls"/);
  assert.match(html,/id="dvA11yStatus"[^>]*role="status"[^>]*aria-live="polite"/);
});

test('Dark Void respects reduced-motion and high-contrast preferences without lowering default graphics',()=>{
  assert.match(html,/prefers-reduced-motion:reduce/);
  assert.match(html,/prefers-contrast:more/);
  assert.match(html,/forced-colors:active/);
  assert.match(client,/matchMedia\('\(prefers-reduced-motion: reduce\)'\)/);
  assert.match(client,/if\(!reducedMotion\)eye\.update\(now,dt\)/);
  assert.match(client,/renderer\.toneMapping=THREE\.ACESFilmicToneMapping/);
  assert.match(client,/renderer\.setPixelRatio\(Math\.min\(2,devicePixelRatio\|\|1\)\)/);
});