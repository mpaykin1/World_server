'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const director=fs.readFileSync(path.join(root,'shared','world-stack-autodemo.mjs'),'utf8');
const bridge=fs.readFileSync(path.join(root,'apps','voxel-world','autodemo-bridge.mjs'),'utf8');
const client=fs.readFileSync(path.join(root,'apps','voxel-world','client.js'),'utf8');

test('canonical autodemo covers the agreed interactive stack story',()=>{
  for(const stage of ['direction','weather','creature','morph','behavior','enemy','combat','build','ai','treasure','crowd','story','past','next','action','neighbor','newWorld','inhabitants','newChange']) assert.match(director,new RegExp(`id:'${stage}'`));
  for(const key of ['sunset','night','storm','wind','attack','ranged','fortress','diamonds','ancientArtifact','giants','openPortal','tame','messenger','volcanic','ancientCity']) assert.match(director,new RegExp(`'${key}'`));
  assert.match(director,/Проверить соседний мир/);
  assert.match(director,/Смотреть канон/);
  assert.match(director,/AUTODEMO_CAPABILITIES/);
});

test('voxel bridge materializes choices as runtime changes',()=>{
  for(const hook of ['buildStructure','spawnTreasure','materializeCanon','createWorldPreview','recordCanon','neighborUrl','chooseDirection']) assert.match(bridge,new RegExp(hook));
  assert.match(bridge,/set_block/);
  assert.match(bridge,/world-factory/);
  assert.match(bridge,/Authorization/);
});

test('voxel runtime starts and exposes the interactive autodemo',()=>{
  assert.match(client,/installVoxelAutodemo/);
  assert.match(client,/autodemo\?\.update/);
  assert.match(client,/autodemo:autodemo\?\.stats/);
});


