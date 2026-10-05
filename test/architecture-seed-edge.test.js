'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {createArchitectureDNA}=require('../lib/architecture-seeds');

const ROOT=path.join(__dirname,'..');
const catalog=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/voxel/prokopiy-minecraft/catalog.json'),'utf8'));

test('Cloudflare Architecture Seed adapter preserves canonical generation fields used by Minecraft MVP',async()=>{
  const edge=await import('../shared/architecture-seed-edge.mjs');
  const input={seed:'-3361685360695458093:0:0',idea:'gothic flooded ruins',theme:'mixed'};
  const canonical=createArchitectureDNA(input);
  const portable=await edge.createArchitectureSeedProfile(input,catalog);
  assert.equal(portable.seedKey,canonical.seedKey);
  assert.equal(portable.seed32,canonical.seed32);
  assert.equal(portable.primaryFamily,canonical.primaryFamily);
  assert.deepEqual(portable.modifiers,canonical.modifiers);
  assert.equal(portable.urbanism.roadPattern,canonical.urbanism.roadPattern);
  assert.equal(portable.subSeeds.buildings,canonical.subSeeds.buildings);
  assert.equal(portable.subSeeds.landmarks,canonical.subSeeds.landmarks);
  assert.equal(portable.biome.flooded,canonical.biome.flooded);
  assert.deepEqual(portable.minecraft.structures.pool,canonical.minecraft.structures.pool);
  assert.equal(portable.minecraft.structures.density,canonical.minecraft.structures.density);
  assert.equal(portable.minecraft.structures.rareStructure,canonical.minecraft.structures.rareStructure);
  assert.deepEqual(portable.minecraft.assets.mobs.map(x=>x.id),canonical.minecraft.assets.mobs.map(x=>x.id));
});

test('Cloudflare worker serves preview-seed before authenticated write gate',()=>{
  const worker=fs.readFileSync(path.join(ROOT,'cloudflare-worker.js'),'utf8');
  assert.match(worker,/architectureSeedPreview/);
  assert.match(worker,/cloudflare-native-architecture-seed-preview/);
  assert.match(worker,/body\?\.action !== 'preview-seed'/);
  assert.match(worker,/if \(route === 'world-factory'\)[\s\S]*architectureSeedPreview[\s\S]*const write/);
});

test('Minecraft successor cannot declare ready before a materialized chunk and articulated rig',()=>{
  const client=fs.readFileSync(path.join(ROOT,'apps/prokopiy-minecraft-mvp/client.js'),'utf8');
  assert.match(client,/createProceduralPlayerRig/);
  assert.match(client,/animatePlayerRig/);
  assert.match(client,/await syncChunks\(\{awaitCenter:true\}\)/);
  assert.match(client,/worldReady:true,animationReady:true/);
  assert.match(client,/getChunkCount/);
  assert.match(client,/getAnimationState/);
  assert.match(client,/browser-deterministic-fallback/);
});
