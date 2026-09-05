#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { performance } = require('node:perf_hooks');

const cf = require('../lib/creature-factory');
const POLICY = path.join(__dirname, '..', 'data', 'creature-lod-policy.json');
const OUT_PATH = path.join(process.cwd(), 'CREATURE_FACTORY_BENCHMARK.json');

const COUNTS = [1, 100, 1000, 5000];
const MAX_TOTAL_MS = 20000;

const REPRESENTATIVE_RECIPES = [
  {
    format: 'zero-signal-procedural-asset-v1',
    category: 'dragon',
    name: 'Bench Dragon',
    params: { seed: 'bench-dragon', height: 14, detail: 1.4, fur: 0 },
    materialSettings: { shaderPreset: 2, skinPreset: 3, glossAmount: 0.4 },
    controls: { rotation: 1, speed: 1.2, amplitude: 0.9, hatching: 2.0, density: 3 }
  },
  {
    format: 'zero-signal-godot-procedural-asset-v1',
    category: 'human_sword',
    name: 'Bench Knight',
    params: { seed: 'bench-knight', height: 9, detail: 1.1 },
    materialSettings: { shaderPreset: 1, skinPreset: 1, glossAmount: 0.2 },
    controls: { rotation: 0, speed: 1, amplitude: 1, hatching: 2.5, density: 2 }
  },
  {
    format: 'zero-signal-procedural-asset-v1',
    category: 'creature',
    name: 'Bench Critter',
    params: { seed: 'bench-critter', height: 4, detail: 0.8 },
    materialSettings: { shaderPreset: 0, skinPreset: 0, glossAmount: 0.1 },
    controls: { rotation: 0, speed: 0.5, amplitude: 1, hatching: 1.5, density: 1 }
  },
  {
    format: 'zero-signal-godot-procedural-asset-v1',
    category: 'reptile',
    name: 'Bench Reptile',
    params: { seed: 'bench-reptile', height: 5, detail: 0.9 },
    materialSettings: { shaderPreset: 1, skinPreset: 2, glossAmount: 0.3 },
    controls: { rotation: 0, speed: 1, amplitude: 1.1, hatching: 2.0, density: 2 }
  }
];

const RECIPES = REPRESENTATIVE_RECIPES.map((asset) => cf.buildRecipe(asset));

const LOD_DISTANCES = [5, 20, 45, 70, 90, 130, 200];
const POLICY_OBJ = cf.loadPolicy(POLICY);

function makeSimulation(count) {
  const policy = POLICY_OBJ;
  const creatures = [];
  const projected = [];
  for (let i = 0; i < count; i++) {
    const recipe = RECIPES[i % RECIPES.length];
    const distance = LOD_DISTANCES[i % LOD_DISTANCES.length];
    const tier = cf.getLodTier(distance, policy);
    const creature = {
      id: `bench:${i}`,
      recipe,
      distance,
      visible: tier !== 'low',
      sleeping: false
    };
    creatures.push(creature);
    projected.push({ visible: creature.visible, distance, targetFps: 60 });
  }
  return { creatures, projected, policy };
}

function runBenchmark() {
  const platform = `${os.platform()} ${os.release()} ${os.arch()}`;
  const nodeVersion = process.version;
  let totalBenchMs = 0;
  const result = {
    schemaVersion: 1,
    generator: 'creature-factory-benchmark.cjs',
    generatedAt: new Date().toISOString(),
    platform,
    nodeVersion,
    unit: 'CPU/runtime planning + update simulation (NOT rendered GPU FPS)',
    note: 'CREATURE_FACTORY_BENCHMARK measures headless CPU cost of LOD planning, quality planning and update budgeting only. It does NOT render, rasterize, skin or measure WebGL/GPU frame time. It must NOT be reported or interpreted as rendered FPS. Rendered Web FPS requires a live browser/game loop benchmark.',
    counts: []
  };

  for (const count of COUNTS) {
    const { creatures, projected, policy } = makeSimulation(count);

    const start = performance.now();
    let iterations = 0;
    let sleepingCount = 0;
    const instancingGroups = new Set();
    const lodCounts = { full: 0, high: 0, medium: 0, low: 0 };

    while (performance.now() - start < 250 && iterations < 2000) {
      for (let i = 0; i < creatures.length; i++) {
        const c = creatures[i];
        const p = projected[i];
        const tier = cf.getLodTier(c.distance, policy);
        lodCounts[tier] = (lodCounts[tier] || 0) + 1;
        const quality = cf.planCreatureQuality(p, POLICY);
        c.sleeping = quality.sleep;
        if (quality.sleep) sleepingCount++;
        const key = cf.instancingKey(c.recipe, tier);
        instancingGroups.add(key);
        if (!quality.sleep) cf.computeUpdateInterval(tier, policy);
      }
      iterations++;
    }
    const totalMs = performance.now() - start;
    totalBenchMs += totalMs;
    const totalCreatureOps = count * iterations;
    const avgMsPerCreature = totalMs / totalCreatureOps;
    const creaturesPerSecond = totalCreatureOps / (totalMs / 1000);

    if (iterations > 0) {
      lodCounts.full = Math.round(lodCounts.full / iterations);
      lodCounts.high = Math.round(lodCounts.high / iterations);
      lodCounts.medium = Math.round(lodCounts.medium / iterations);
      lodCounts.low = Math.round(lodCounts.low / iterations);
      sleepingCount = Math.round(sleepingCount / iterations);
    }

    result.counts.push({
      count,
      iterations,
      totalMs: Number(totalMs.toFixed(3)),
      avgMsPerCreature: Number(avgMsPerCreature.toFixed(6)),
      creaturesPerSecond: Number(creaturesPerSecond.toFixed(1)),
      lodDistribution: lodCounts,
      sleepingCount,
      instancingGroupCount: instancingGroups.size
    });
  }

  if (totalBenchMs > MAX_TOTAL_MS) {
    throw new Error(`benchmark exceeded budget: ${totalBenchMs.toFixed(0)}ms > ${MAX_TOTAL_MS}ms`);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(result, null, 2) + '\n');
  console.log(`CREATURE_FACTORY_BENCH PASS totalBenchMs=${Math.round(totalBenchMs)}ms output=${OUT_PATH}`);
  for (const entry of result.counts) {
    console.log(`  count=${entry.count} iter=${entry.iterations} totalMs=${entry.totalMs} avgMs=${entry.avgMsPerCreature} cps=${entry.creaturesPerSecond} lod=${JSON.stringify(entry.lodDistribution)} sleep=${entry.sleepingCount} inst=${entry.instancingGroupCount}`);
  }
}

try {
  runBenchmark();
} catch (err) {
  console.error(`CREATURE_FACTORY_BENCH FAIL: ${err.message}`);
  process.exit(1);
}
