'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.join(__dirname,'..','apps','dark-void-scene','index.html'),'utf8');

test('Dark Void exposes explicit deterministic offline status without replacing the existing runtime',()=>{
  assert.match(html,/id="dvNetwork"/);
  assert.match(html,/role="status"/);
  assert.match(html,/aria-live="polite"/);
  assert.match(html,/navigator\.onLine===false/);
  assert.match(html,/Offline · deterministic world mode/);
  assert.match(html,/addEventListener\('online',sync\)/);
  assert.match(html,/addEventListener\('offline',sync\)/);
  assert.match(html,/src="\.\/client\.js"/);
});

test('offline indicator does not alter default renderer, controls, or graphics assets',()=>{
  assert.match(html,/golden-ai3d-playable-runtime\.js/);
  assert.match(html,/mobile-game-shell\.js/);
  assert.match(html,/mobile-game-shell\.css/);
  assert.match(html,/WASD \/ arrows — move/);
});