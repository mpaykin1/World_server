'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ROOT=path.join(__dirname,'..');

function read(rel){return fs.readFileSync(path.join(ROOT,rel),'utf8').replace(/^\uFEFF/,'');}

test('Prokopiy Minecraft MVP has hard viewport lock',()=>{
  const css=read('apps/prokopiy-minecraft-mvp/style.css');
  assert.match(css,/html,body\{[^}]*overflow:hidden;[^}]*overscroll-behavior:none/);
  assert.match(css,/body\{position:fixed;inset:0\}/);
  assert.match(css,/#game-root,canvas\{[^}]*position:absolute;[^}]*inset:0;[^}]*width:100%;height:100%;[^}]*touch-action:none/);
});

test('MVP consumes the curated import catalog and exposes a ready global',()=>{
  const js=read('apps/prokopiy-minecraft-mvp/client.js');
  assert.match(js,/prokopiy-minecraft\/catalog\.json/);
  assert.match(js,/globalThis\.ProkopiyMinecraftMVP=\{ready:true/);
  const catalog=JSON.parse(read('assets/voxel/prokopiy-minecraft/catalog.json'));
  assert.equal(catalog.models.mobs.length,91);
  assert.equal(catalog.models.items.length,55);
  assert.equal(catalog.models.entities.length,31);
});

test('MVP is discoverable by Golden Worlds without claiming certification',()=>{
  const registry=JSON.parse(read('data/app-release-registry.json'));
  const app=registry.apps['prokopiy-minecraft-mvp'];
  assert.equal(app.status,'experimental');
  assert.equal(app.visible,false);
  assert.equal(app.worldMenu.show,true);
  assert.match(read('shared/golden-ui-shell.js'),/worldId:'prokopiy-minecraft-mvp'/);
});


test('MVP uses third-person character control instead of moving the page',()=>{
  const js=read('apps/prokopiy-minecraft-mvp/client.js');
  assert.match(js,/thirdPerson:true/);
  assert.match(js,/canvas\.addEventListener\('pointermove'/);
  assert.match(js,/player\.pos\.addScaledVector/);
  assert.match(js,/touchMove\.x/);
  assert.match(js,/camera\.lookAt\(player\.pos\.x/);
});

test('MVP streams endless chunks from Architecture Seeds and seed-built creatures',()=>{
  const js=read('apps/prokopiy-minecraft-mvp/client.js');
  assert.match(js,/action:'preview-seed'/);
  assert.match(js,/infiniteChunks:true/);
  assert.match(js,/architectureSeeds:true/);
  assert.match(js,/ArchitectureSeedRuntime\?\.sample/);
  assert.match(js,/profile\.minecraft\?\.assets\?\.mobs/);
  assert.match(js,/function syncChunks\(\)/);
  assert.match(read('lib/api-handlers/world-factory.js'),/action === 'preview-seed'/);
});
