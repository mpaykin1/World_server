import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const client=readFileSync(resolve(root,'apps/voxel-world/client.js'),'utf8');
const lab=readFileSync(resolve(root,'apps/voxel-world/gothic-destruction-lab.mjs'),'utf8');

test('gothic destruction is opt-in and does not alter default voxel-world startup',()=>{
  assert.match(client,/get\('gothicDestruction'\)==='1'/);
  assert.match(client,/installGothicDestructionLab/);
  assert.match(client,/gothicDestruction\?\.update\(now,dt\)/);
  assert.match(client,/fireGothicCannon/);
  assert.doesNotMatch(client,/gothicDestruction=await installGothicDestructionLab/);
});

test('runtime lab reuses canonical grammar damage planner and bounded Rapier adapter',()=>{
  assert.match(lab,/buildGothicTower/);
  assert.match(lab,/fireCannonAtStructure/);
  assert.match(lab,/createRapierCollapseRuntime/);
  assert.match(lab,/loadPinnedRapier/);
  assert.match(lab,/maxBodies:8/);
  assert.match(lab,/maxColliders:1400/);
  assert.match(lab,/maxClusterVoxels:1200/);
  assert.match(lab,/physics\.spawn\(result\.collapse/);
  assert.match(lab,/physics\.step\(1\)/);
});

test('runtime keeps static and falling voxels separate after a cannon shot',()=>{
  assert.match(lab,/const spawnedIds=new Set/);
  assert.match(lab,/dynamicKeys\.add\(key\)/);
  assert.match(lab,/rebuildStatic\(result\.damage\?\.remaining\|\|tower\.voxels,dynamicKeys\)/);
  assert.match(lab,/bodyMeshes\.set\(plan\.id,mesh\)/);
});
