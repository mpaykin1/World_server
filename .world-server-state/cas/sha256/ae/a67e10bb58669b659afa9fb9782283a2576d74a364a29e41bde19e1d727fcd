'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const client=fs.readFileSync(path.join(root,'apps','ai3d-voxel-city','client.js'),'utf8');
const worker=fs.readFileSync(path.join(root,'apps','ai3d-voxel-city','mesher-worker.js'),'utf8');

test('voxel runtime has chunked greedy meshing and worker offload',()=>{
  assert.ok(client.includes("new Worker('./mesher-worker.js')"));
  assert.match(worker,/chunked_greedy/);
  assert.match(worker,/internalFaces:'culled'/);
  assert.match(worker,/triangleReductionPercent/);
});

test('voxel runtime has performance tiers, streaming, HLOD and no dynamic shadows',()=>{
  assert.match(client,/SAFE:/);
  assert.match(client,/ULTRA:/);
  assert.ok(client.includes('renderer.shadowMap.enabled=false'));
  assert.match(client,/setStreamingCenter/);
  assert.match(client,/FogExp2/);
  assert.match(client,/buildFarChunk/);
  assert.match(client,/adaptResolution/);
});
