#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { performance } = require('node:perf_hooks');

const cf = require('../lib/creature-factory');

const ROOT = path.resolve(__dirname, '..');
const POLICY = path.join(ROOT, 'data', 'creature-lod-policy.json');
const REPORT_FILE = path.join(ROOT, 'CREATURE_FACTORY_BENCHMARK.json');

const COUNTS = [1, 100, 1000, 5000];
const ITERATIONS = { 1: 600, 100: 80, 1000: 8, 5000: 3 };
const MAX_RUNTIME_MS = 15000;
const FORMAT_HTML = 'zero-signal-procedural-asset-v1';
const FORMAT_GODOT = 'zero-signal-godot-procedural-asset-v1';

const BENCHMARKED_APIS = ['buildRecipe', 'planCreatureQuality', 'instancingKey', 'AnimationScheduler'];

function round(value, digits) {
  const f = Math.pow(10, digits);
  return Math.round(value * f) / f;
}

function buildAssetPool() {
  const pool = [];
  for (let i = 0; i < cf.CATEGORIES.length; i++) {
    const category = cf.CATEGORIES[i];
    const asset = i % 2 === 1
      ? {
          format: FORMAT_GODOT,
          category,
          name: `Godot ${category}`,
          params: { seed: `pool-${category}`, wing: 2, scale: 1 },
          controls: { rotation: 0, speed: 1, amplitude: 1, hatching: 2.5, density: 2 }
        }
      : {
          format: FORMAT_HTML,
          category,
          name: `Procedural ${category}`,
          params: { seed: `pool-${category}`, height: 12, detail: 1.2 },
          materialSettings: { shaderPreset: 1, skinPreset: 2, glossAmount: 0.3 },
          object: { metadata: { version: 4 }, geometries: [{ uuid: `g${i}` }] }
        };
    pool.push(Object.freeze(asset));
  }
  return pool;
}

function creatureIds(count) {
  const ids = new Array(count);
  for (let i = 0; i < count; i++) ids[i] = `c:0:0:${i}`;
  return ids;
}

function contextFor(i) {
  const ring = Math.floor(i / 360);
  const angle = i % 360;
  const distance = ring * 40 + 5 + (angle % 7);
  const ctx = { visible: i % 8 !== 0, distance, targetFps: 60 };
  if (i % 11 === 0) ctx.mobile = true;
  if (i % 13 === 0) ctx.frameTimeMs = 21;
  if (i % 17 === 0) ctx.cpuPressure = 0.8;
  return ctx;
}

function benchCount(count, iterations, pool) {
  const maxPerFrame = Math.max(1, Math.floor(count / 30));
  const scheduler = new cf.AnimationScheduler({ maxPerFrame });
  const ids = creatureIds(count);

  const t0 = performance.now();
  let recipes;
  let plans;
  let keys;
  for (let it = 0; it < iterations; it++) {
    recipes = new Array(count);
    plans = new Array(count);
    keys = new Array(count);
    for (let i = 0; i < count; i++) {
      const recipe = cf.buildRecipe(pool[i % pool.length]);
      const plan = cf.planCreatureQuality(contextFor(i), POLICY);
      recipes[i] = recipe;
      plans[i] = plan;
      keys[i] = cf.instancingKey(recipe, plan.tier);
    }
    let scheduled = 0;
    for (let frame = 0; frame < ids.length && scheduled < ids.length; frame++) {
      scheduled += scheduler.schedule(ids).length;
    }
  }
  const totalMs = performance.now() - t0;

  const sleeping = plans.reduce((acc, p) => acc + (p.sleep ? 1 : 0), 0);
  const lodDistribution = {};
  for (const tier of ['full', 'high', 'medium', 'low']) lodDistribution[tier] = 0;
  for (const p of plans) lodDistribution[p.tier] = (lodDistribution[p.tier] || 0) + 1;
  const instancingGroupCount = new Set(keys).size;
  const checksumParts = [];
  for (let i = 0; i < count; i++) checksumParts.push(`${recipes[i].hash}:${plans[i].tier}`);
  const deterministicChecksum = crypto.createHash('sha256').update(checksumParts.join('\u0000')).digest('hex');

  return {
    count,
    iterations,
    totalMs: round(totalMs, 3),
    avgMsPerCreature: round(totalMs / iterations / count, 6),
    creaturesPerSecond: Math.round((iterations * count) / (totalMs / 1000)),
    sleepingCount: sleeping,
    lodDistribution,
    instancingGroupCount,
    deterministicChecksum,
    schedulerMaxPerFrame: maxPerFrame,
    schedulerDrainFramesPerIteration: Math.ceil(count / maxPerFrame)
  };
}

async function emitTelemetry(report) {
  let span;
  try {
    const telemetry = require('./integration-telemetry-lib.cjs');
    span = telemetry.startSpan('creature-factory-benchmark', {
      benchmarkType: report.benchmarkType,
      nodeVersion: report.nodeVersion,
      counts: JSON.stringify(report.counts.map((c) => c.count))
    });
  } catch (err) {
    console.warn('[creature-factory-benchmark] telemetry span not recorded (existing hook unavailable):', err && err.message);
    return;
  }
  try {
    await span.end('OK', {
      totalRuntimeMs: Math.round(report.runtimeMs),
      maxCreaturesPerSecond: Math.max(...report.counts.map((c) => c.creaturesPerSecond)),
      determinismVerified: report.determinismPass
    });
  } catch (err) {
    console.warn('[creature-factory-benchmark] telemetry span finalize failed:', err && err.message);
  }
}

(async () => {
  const startedAt = performance.now();
  const pool = buildAssetPool();
  for (let i = 0; i < 100; i++) {
    cf.buildRecipe(pool[i % pool.length]);
    cf.planCreatureQuality(contextFor(i), POLICY);
  }

  const counts = COUNTS.map((count) => benchCount(count, ITERATIONS[count], pool));
  const runtimeMs = performance.now() - startedAt;

  const report = {
    schemaVersion: 1,
    benchmarkType: 'CPU_RUNTIME_NOT_RENDERED_FPS',
    title: 'Creature Factory CPU/runtime planning overhead benchmark',
    note: 'Measures Node.js planning cost of buildRecipe, planCreatureQuality, instancingKey and AnimationScheduler only. This is NOT a rendered Web/GPU FPS benchmark; it contains no renderer, no GPU workload, and no browser. It answers "how much CPU does creature planning take", not "how many rendered frames per second".',
    generatedAt: new Date().toISOString(),
    platform: os.platform(),
    osType: os.type(),
    osRelease: os.release(),
    arch: process.arch,
    nodeVersion: process.version,
    cpuModel: (os.cpus()[0] && os.cpus()[0].model) || 'unavailable',
    policyFile: 'data/creature-lod-policy.json',
    benchmarkedApis: BENCHMARKED_APIS,
    runtimeMs: round(runtimeMs, 3),
    runtimeUnder15s: runtimeMs < MAX_RUNTIME_MS,
    determinismPass: counts.every((c) => typeof c.deterministicChecksum === 'string' && c.deterministicChecksum.length === 64),
    counts
  };

  fs.writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));

  await emitTelemetry(report);

  if (!report.determinismPass) process.exitCode = 1;
  if (!report.runtimeUnder15s) process.exitCode = 1;
})().catch((err) => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});