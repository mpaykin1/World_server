#!/usr/bin/env node
'use strict';
// Creature Factory deterministic CPU/runtime planning benchmark.
// Measures buildRecipe, planCreatureQuality, instancingKey and AnimationScheduler
// ONLY. This is CPU runtime planning, NOT a GPU/rendered FPS measurement. No
// WebGL, no renderer, no frame loop. Use a rendered browser harness for FPS.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { performance } = require('perf_hooks');
const cf = require('../lib/creature-factory');

const POLICY = path.join(__dirname, '..', 'data', 'creature-lod-policy.json');
const OUT = path.join(process.cwd(), 'CREATURE_FACTORY_BENCHMARK.json');

const COUNTS = [1, 100, 1000, 5000];
const ITERATIONS = Object.freeze({ 1: 200, 100: 40, 1000: 12, 5000: 5 });
const TOTAL_BUDGET_MS = 15000;
const CATEGORIES = cf.CATEGORIES;

function htmlAsset(seed, category) {
  return {
    format: 'zero-signal-procedural-asset-v1',
    category,
    name: `Benchmark Creature ${seed}`,
    params: { seed, height: 12, detail: 1.2 + (seed % 7) * 0.05 },
    materialSettings: { shaderPreset: 1, skinPreset: 2, glossAmount: 0.3 },
    object: { metadata: { version: 4 }, geometries: [{ uuid: `g-${seed}` }] }
  };
}

function lodDistribution(plans, order) {
  const dist = {};
  for (const tier of order) dist[tier] = 0;
  for (const p of plans) dist[p.tier] = (dist[p.tier] || 0) + 1;
  return Object.freeze(dist);
}

function deterministicChecksum(keys, plans) {
  const sleeping = plans.filter(p => p.sleep).length;
  const body = keys.slice().sort().join('|') + '::' + sleeping;
  return crypto.createHash('sha256').update(body).digest('hex');
}

// Spread a creature's distance across [0, 400] so the LOD budget covers all four
// tiers; distances beyond the low tier's 160m cull range naturally sleep.
function distanceFor(i, count) {
  if (count <= 1) return 0;
  return (i / (count - 1)) * 400;
}

function runIteration(count) {
  const assets = new Array(count);
  for (let i = 0; i < count; i++) assets[i] = htmlAsset(i, CATEGORIES[i % CATEGORIES.length]);
  const recipes = assets.map(a => cf.buildRecipe(a));
  const plans = recipes.map((r, i) =>
    cf.planCreatureQuality(
      { visible: true, distance: distanceFor(i, count), targetFps: 60, mobile: false },
      POLICY
    )
  );
  const keys = recipes.map((r, i) => cf.instancingKey(r, plans[i].tier));
  const scheduler = new cf.AnimationScheduler({ maxPerFrame: 8 });
  const ids = recipes.map((r, i) => `creature:${r.hash}:${i}`);
  let dispatched = 0;
  let batches = 0;
  let guard = 0;
  while (dispatched < ids.length && guard < count + 64) {
    const batch = scheduler.schedule(ids);
    if (batch.length === 0) break;
    dispatched += batch.length;
    batches += 1;
    guard += 1;
  }
  return {
    recipes,
    plans,
    keys,
    sleeping: plans.filter(p => p.sleep).length,
    lodDist: lodDistribution(plans, cf.loadPolicy(POLICY).tierOrder),
    instancingGroups: new Set(keys).size,
    animationBatches: batches,
    checksum: deterministicChecksum(keys, plans)
  };
}

function benchmarkCount(count) {
  runIteration(count); // warmup (JIT, module load)
  const iterations = ITERATIONS[count] || 5;
  const start = performance.now();
  let last = null;
  for (let it = 0; it < iterations; it++) last = runIteration(count);
  const totalMs = performance.now() - start;
  const totalCreatures = iterations * count;
  return {
    count,
    iterations,
    totalMs: Number(totalMs.toFixed(3)),
    avgMsPerCreature: Number((totalMs / totalCreatures).toFixed(6)),
    creaturesPerSecond: Number(((totalCreatures / totalMs) * 1000).toFixed(1)),
    sleepingCount: last.sleeping,
    lodDistribution: last.lodDist,
    instancingGroupCount: last.instancingGroups,
    animationBatches: last.animationBatches,
    deterministicChecksum: last.checksum
  };
}

const started = Date.now();
const perCount = [];
let grandTotalMs = 0;
for (const count of COUNTS) {
  const r = benchmarkCount(count);
  perCount.push(r);
  grandTotalMs += r.totalMs;
  if (grandTotalMs > TOTAL_BUDGET_MS) {
    console.error(`[CREATURE_FACTORY_BENCHMARK] budget exceeded (${grandTotalMs}ms > ${TOTAL_BUDGET_MS}ms)`);
    process.exit(1);
  }
}

const report = {
  schemaVersion: '1.0.0',
  benchmarkType: 'CPU_RUNTIME_NOT_RENDERED_FPS',
  renderedFps: null,
  renderingContext: 'CPU_PLANNING_ONLY',
  note: 'Not a GPU/rendered FPS measurement. Measures deterministic CPU planning/runtime only: buildRecipe, planCreatureQuality, instancingKey, AnimationScheduler. Rendered Web FPS and Godot-native renderer parity are separate open gaps.',
  generatedAt: new Date().toISOString(),
  startedAt: new Date(started).toISOString(),
  platform: `${process.platform}-${process.arch}`,
  nodeVersion: process.version,
  policy: path.relative(process.cwd(), POLICY).replace(/\\/g, '/'),
  totalMs: Number(grandTotalMs.toFixed(3)),
  perCount: perCount
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify(report, null, 2));