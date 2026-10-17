'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createFrameMetrics } = require('../shared/graphics/frame-metrics.js');

function trace(intervals, options) {
  const metrics = createFrameMetrics(options);
  let now = 0;
  assert.equal(metrics.recordFrame(now), false);
  for (const interval of intervals) {
    now += interval;
    assert.equal(metrics.recordFrame(now), true);
  }
  return metrics;
}

test('zero is a valid baseline and only completed intervals count', () => {
  const metrics = createFrameMetrics();
  assert.equal(Object.isFrozen(metrics), true);
  assert.equal(metrics.snapshot().fps, null);
  assert.equal(metrics.recordFrame(0, { calls: 999 }), false);
  assert.equal(metrics.snapshot().sampleCount, 0);
  assert.equal(metrics.recordFrame(20, { calls: 0 }), true);
  const result = metrics.snapshot({ includeSamples: true });
  assert.equal(result.schema, 'graf-frame-metrics');
  assert.equal(result.version, 1);
  assert.equal(result.capacity, 240);
  assert.equal(result.sampleCount, 1);
  assert.equal(result.elapsedMs, 20);
  assert.equal(result.fps, 50);
  assert.deepEqual(result.drawCalls, { sampleCount: 1, mean: 0, p95: 0, max: 0 });
  assert.deepEqual(result.rawSamples, [
    { frameMs: 20, calls: 0, triangles: null, lines: null, points: null }
  ]);
});

test('wall-time FPS includes long stalls and does not average instantaneous FPS', () => {
  const alternating = trace([10, 100, 10, 100]).snapshot();
  assert.equal(alternating.elapsedMs, 220);
  assert.equal(alternating.frameTimeMs.mean, 55);
  assert.equal(alternating.fps, 4000 / 220);

  const stalled = trace([16, 200, 500, 16]).snapshot({ includeSamples: true });
  assert.equal(stalled.sampleCount, 4);
  assert.equal(stalled.elapsedMs, 732);
  assert.equal(stalled.fps, 4000 / 732);
  assert.equal(stalled.frameTimeMs.max, 500);
  assert.deepEqual(stalled.rawSamples.map(sample => sample.frameMs), [16, 200, 500, 16]);
});

test('percentiles use nearest rank and jank uses the configured frame budget', () => {
  const result = trace([10, 20, 100, 500], { targetFps: 60 }).snapshot();
  assert.deepEqual(result.frameTimeMs, {
    mean: 157.5, p50: 20, p95: 500, p99: 500, min: 10, max: 500
  });
  assert.deepEqual(result.jank, { thresholdMs: 25, count: 2, ratio: 0.5 });

  const boundary = trace([25, 26], { targetFps: 60 }).snapshot();
  assert.equal(boundary.jank.count, 1);
  assert.equal(boundary.jank.ratio, 0.5);
});

test('ring wrap evicts old intervals and counters together, retaining chronological samples', () => {
  const metrics = createFrameMetrics({ capacity: 3 });
  metrics.recordFrame(0);
  metrics.recordFrame(10, { calls: 900 });
  metrics.recordFrame(30, { calls: 2 });
  metrics.recordFrame(60, { calls: 3 });
  metrics.recordFrame(100, { calls: 4 });
  const result = metrics.snapshot({ includeSamples: true });
  assert.equal(result.sampleCount, 3);
  assert.equal(result.elapsedMs, 90);
  assert.equal(result.fps, 3000 / 90);
  assert.deepEqual(result.frameTimeMs, {
    mean: 30, p50: 30, p95: 40, p99: 40, min: 20, max: 40
  });
  assert.deepEqual(result.drawCalls, { sampleCount: 3, mean: 3, p95: 4, max: 4 });
  assert.deepEqual(result.rawSamples.map(sample => [sample.frameMs, sample.calls]), [
    [20, 2], [30, 3], [40, 4]
  ]);
});

test('long recording remains bounded by the selected sample capacity', () => {
  const metrics = createFrameMetrics({ capacity: 7 });
  metrics.recordFrame(0);
  for (let frame = 1; frame <= 10000; frame++) {
    metrics.recordFrame(frame * 10, { calls: frame });
  }
  const result = metrics.snapshot({ includeSamples: true });
  assert.equal(result.sampleCount, 7);
  assert.equal(result.rawSamples.length, 7);
  assert.equal(result.elapsedMs, 70);
  assert.equal(result.fps, 100);
  assert.deepEqual(result.rawSamples.map(sample => sample.calls), [
    9994, 9995, 9996, 9997, 9998, 9999, 10000
  ]);
});

test('explicit discontinuity omits a hidden/resume gap without losing measured frames', () => {
  const metrics = trace([10, 20]);
  metrics.markDiscontinuity();
  assert.equal(metrics.recordFrame(100000, { calls: 999 }), false);
  assert.equal(metrics.recordFrame(100030, { calls: 3 }), true);
  const result = metrics.snapshot({ includeSamples: true });
  assert.deepEqual(result.rawSamples.map(sample => sample.frameMs), [10, 20, 30]);
  assert.equal(result.elapsedMs, 60);
  assert.equal(result.fps, 50);
  assert.deepEqual(result.drawCalls, { sampleCount: 1, mean: 3, p95: 3, max: 3 });
});

test('reset clears the ring and timestamp baseline', () => {
  const metrics = trace([20, 30]);
  metrics.reset();
  const result = metrics.snapshot({ includeSamples: true });
  assert.equal(result.sampleCount, 0);
  assert.equal(result.elapsedMs, 0);
  assert.equal(result.fps, null);
  assert.equal(result.jank.ratio, null);
  assert.deepEqual(result.rawSamples, []);
  assert.equal(metrics.recordFrame(0), false);
  assert.equal(metrics.recordFrame(10), true);
  assert.equal(metrics.snapshot().fps, 100);
});

test('invalid timestamps throw atomically and duplicate/backward timestamps preserve baseline', () => {
  const metrics = trace([20]);
  const before = metrics.snapshot({ includeSamples: true });
  for (const timestamp of [NaN, Infinity, -Infinity, -1, undefined, null, '30']) {
    assert.throws(() => metrics.recordFrame(timestamp), RangeError);
    assert.deepEqual(metrics.snapshot({ includeSamples: true }), before);
  }
  assert.equal(metrics.recordFrame(20, { calls: 999 }), false);
  assert.equal(metrics.recordFrame(10, { calls: 999 }), false);
  assert.deepEqual(metrics.snapshot({ includeSamples: true }), before);
  assert.equal(metrics.recordFrame(40), true);
  assert.deepEqual(metrics.snapshot({ includeSamples: true }).rawSamples.map(sample => sample.frameMs), [20, 20]);
});

test('missing or invalid counters remain unknown, with independent per-counter coverage', () => {
  const metrics = createFrameMetrics();
  metrics.recordFrame(0);
  metrics.recordFrame(10, { calls: 0, triangles: 12, lines: 2, points: 0 });
  metrics.recordFrame(20);
  metrics.recordFrame(30, { calls: 4, triangles: 24, lines: -1, points: 1.5 });
  metrics.recordFrame(40, { calls: '9', triangles: NaN, lines: Infinity, points: Number.MAX_SAFE_INTEGER + 1 });
  metrics.recordFrame(50, { calls: null, triangles: -1, lines: 0, points: 8 });
  const result = metrics.snapshot({ includeSamples: true });
  assert.deepEqual(result.drawCalls, { sampleCount: 2, mean: 2, p95: 4, max: 4 });
  assert.deepEqual(result.triangles, { sampleCount: 2, mean: 18, p95: 24, max: 24 });
  assert.deepEqual(result.lines, { sampleCount: 2, mean: 1, p95: 2, max: 2 });
  assert.deepEqual(result.points, { sampleCount: 2, mean: 4, p95: 8, max: 8 });
  assert.deepEqual(result.rawSamples[1], {
    frameMs: 10, calls: null, triangles: null, lines: null, points: null
  });
  assert.deepEqual(result.rawSamples[3], {
    frameMs: 10, calls: null, triangles: null, lines: null, points: null
  });
});

test('explicit multipass totals are preserved without taking ownership of the renderer', () => {
  const metrics = createFrameMetrics();
  metrics.recordFrame(0);
  // The engine owns info.autoReset=false and captures both passes before its reset.
  const aggregate = { calls: 2, triangles: 24, lines: 0, points: 0 };
  metrics.recordFrame(16, aggregate);
  aggregate.calls = 0;
  aggregate.triangles = 0;
  const result = metrics.snapshot();
  assert.equal(result.drawCalls.mean, 2);
  assert.equal(result.triangles.mean, 24);
});

test('snapshots are detached and raw sample collection is opt-in', () => {
  const metrics = trace([10, 20]);
  const plain = metrics.snapshot();
  assert.equal(plain.rawSamples, undefined);
  const withSamples = metrics.snapshot({ includeSamples: true });
  withSamples.rawSamples.reverse();
  withSamples.rawSamples[0].frameMs = 999;
  withSamples.frameTimeMs.mean = 999;
  withSamples.drawCalls.sampleCount = 999;
  const result = metrics.snapshot({ includeSamples: true });
  assert.equal(result.frameTimeMs.mean, 15);
  assert.equal(result.drawCalls.sampleCount, 0);
  assert.deepEqual(result.rawSamples.map(sample => sample.frameMs), [10, 20]);
});

test('configuration rejects unbounded storage and invalid FPS budgets', () => {
  for (const capacity of [0, 1, 2.5, 36001, Infinity, NaN, '240']) {
    assert.throws(() => createFrameMetrics({ capacity }), RangeError);
  }
  for (const targetFps of [0, -1, 1001, Infinity, NaN, '60']) {
    assert.throws(() => createFrameMetrics({ targetFps }), RangeError);
  }
  assert.equal(createFrameMetrics({ capacity: 2, targetFps: 1 }).snapshot().capacity, 2);
  assert.equal(createFrameMetrics({ capacity: 36000, targetFps: 1000 }).snapshot().capacity, 36000);
});

test('browser global works without RAF, DOM, timers, network or a quality controller', () => {
  const forbidden = () => { throw new Error('passive collector caused a side effect'); };
  const sandbox = {
    requestAnimationFrame: forbidden, cancelAnimationFrame: forbidden,
    setTimeout: forbidden, setInterval: forbidden, fetch: forbidden,
    performance: { now: forbidden }
  };
  vm.createContext(sandbox);
  const source = fs.readFileSync(path.join(__dirname, '../shared/graphics/frame-metrics.js'), 'utf8');
  vm.runInContext(source, sandbox, { filename: 'frame-metrics.js' });
  assert.equal(typeof sandbox.GRAFFrameMetrics.createFrameMetrics, 'function');
  const metrics = sandbox.GRAFFrameMetrics.createFrameMetrics();
  assert.equal(metrics.recordFrame(0), false);
  assert.equal(metrics.recordFrame(25), true);
  assert.equal(metrics.snapshot().fps, 40);
  metrics.markDiscontinuity();
  metrics.reset();
  assert.equal(sandbox.requestAnimationFrame, forbidden);
});
