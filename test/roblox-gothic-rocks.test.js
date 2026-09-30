'use strict';
const test=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');
const root=path.resolve(__dirname,'..');
function read(rel){return fs.readFileSync(path.join(root,rel),'utf8');}
test('Roblox Gothic Rocks MVP preserves source-derived gameplay constants and World Server reuse',()=>{
  const html=read('apps/roblox-gothic-rocks/index.html'),client=read('apps/roblox-gothic-rocks/client.js');
  assert.match(html,/ai3d-playable-runtime\.js/);assert.match(html,/golden-physics\.js/);assert.match(client,/CHUNK=128\*S/);assert.match(client,/BRIDGE_W=20\*S/);assert.match(client,/THROW_MIN=54\*S/);assert.match(client,/THROW_MAX=108\*S/);assert.match(client,/CHARGE_SECONDS=1\.62/);
  assert.match(client,/kaykit-knight\/model\/Knight\.glb/);assert.match(client,/qualityFloor:85/);assert.match(client,/externalRobloxAssetsUsed:0/);
});
test('MVP exposes an executable graphics visibility and physical throw evidence contract',()=>{
  const client=read('apps/roblox-gothic-rocks/client.js');assert.match(client,/visibilityPercent/);assert.match(client,/state\.fireTest/);assert.match(client,/state\.shots\+\+/);assert.match(client,/state\.impacts\+\+/);assert.match(client,/GameGoldenPhysics\?\.moveSwept/);
});
