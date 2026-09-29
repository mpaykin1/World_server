import test from'node:test';import assert from'node:assert/strict';import fs from'node:fs';
const s=fs.readFileSync(new URL('../apps/dark-void-scene/client.js',import.meta.url),'utf8');
test('Dark Void clears held movement keys on blur/background',()=>{assert.match(s,/resetKeys=\(\)=>keys\.clear\(\)/);assert.match(s,/addEventListener\('blur',resetKeys\)/);assert.match(s,/visibilitychange/);assert.match(s,/document\.hidden/)});
