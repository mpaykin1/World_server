import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync('apps/flooded-cathedral-mvp/index.html','utf8');
const js=fs.readFileSync('apps/flooded-cathedral-mvp/client.js','utf8');
const apng=fs.readFileSync('apps/flooded-cathedral-mvp/assets/fire.apng');

test('flooded cathedral keeps the game viewport locked',()=>{
  assert.match(html,/overflow:hidden/);
  assert.match(html,/touch-action:none/);
  assert.match(html,/viewport-fit=cover/);
});

test('flooded cathedral combines World Server rendering lanes',()=>{
  assert.match(js,/loadActionForgePlayer/);
  assert.match(js,/InstancedMesh/);
  assert.match(js,/PlaneGeometry\(80,190/);
  assert.match(js,/rainCount=coarse\?900:1600/);
  assert.match(html,/fire\.apng/);
});

test('flooded cathedral exposes a measurable visibility gate',()=>{
  assert.match(js,/userNoticeabilityPercent/);
  assert.match(js,/visibilityPercent/);
  assert.match(js,/state\.ready=true/);
});

test('fire sprite is a real animated PNG',()=>{
  assert.equal(apng.subarray(1,4).toString(),'PNG');
  assert.ok(apng.includes(Buffer.from('acTL')),'APNG animation control chunk missing');
});
