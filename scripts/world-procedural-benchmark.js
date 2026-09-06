'use strict';
const { performance } = require('perf_hooks');
const core = require('../shared/world-procedural-core');
const { ProceduralWorkerPool } = require('../lib/world-procedural-worker-pool');
const { compileWorldRecipe } = require('../lib/world-procedural-recipe-engine');

(async () => {
  const compiled = compileWorldRecipe({ worldId: 'bench', seed: 20260831, architecture: { kind: 'gothic', density: 0.6 }, style: { detail: 0.9 } }, { forceTier: 'medium' });
  const coords = [[0,0],[1,0],[0,1],[1,1],[-1,0],[0,-1]];
  let voxels = 0;
  const start = performance.now();
  for (const [x,z] of coords) voxels += core.generateVoxelChunk(compiled.recipe, x, z, compiled.generatorOptions).voxels.length;
  const syncMs = performance.now() - start;

  const coldStart = performance.now();
  const pool = new ProceduralWorkerPool({ size: Math.min(2, coords.length) });
  const coldChunk = await pool.generateChunk(compiled.recipe, 99, 99, compiled.generatorOptions);
  const workerColdStartMs = performance.now() - coldStart;

  const warmStart = performance.now();
  const chunks = await Promise.all(coords.map(([x,z]) => pool.generateChunk(compiled.recipe, x, z, compiled.generatorOptions)));
  const workerWarmBatchMs = performance.now() - warmStart;
  await pool.close();
  const workerVoxels = chunks.reduce((sum, c) => sum + c.voxels.length, 0);
  const report = {
    system: 'WORLD_PROCEDURAL_BENCHMARK', voxels, workerVoxels, chunks: coords.length,
    syncBatchMs: +syncMs.toFixed(2), workerColdStartMs: +workerColdStartMs.toFixed(2), workerWarmBatchMs: +workerWarmBatchMs.toFixed(2),
    coldWarmupVoxels: coldChunk.voxels.length,
    note: 'informational. Worker startup is amortized by a long-lived production pool; promote optimizers only with target-device before/after evidence.'
  };
  console.log(JSON.stringify(report, null, 2));
  if (voxels !== workerVoxels) process.exitCode = 1;
})().catch((error) => { console.error(error); process.exitCode = 1; });
