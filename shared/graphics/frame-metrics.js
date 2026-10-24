'use strict';
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GRAFFrameMetrics = factory();
})(typeof globalThis === 'object' ? globalThis : this, function () {
  const counterNames = ['calls', 'triangles', 'lines', 'points'];
  const countValue = value => Number.isSafeInteger(value) && value >= 0 ? value : NaN;
  const nearestRank = (sorted, p) => sorted.length ? sorted[Math.ceil(p * sorted.length) - 1] : null;
  function summary(values) {
    const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
    return {
      sampleCount: sorted.length,
      mean: sorted.length ? sorted.reduce((sum, value) => sum + value, 0) / sorted.length : null,
      p95: nearestRank(sorted, 0.95),
      max: sorted.length ? sorted[sorted.length - 1] : null,
    };
  }

  /** Passive evidence: call once per completed frame with an uncapped timestamp.
   * counters are CALLER-AGGREGATED frame totals, not the last compositing pass.
   * No renderer, clock, visibility listener, RAF or quality control is installed.
   */
  function createFrameMetrics({ capacity = 240, targetFps = 60 } = {}) {
    if (!Number.isInteger(capacity) || capacity < 2 || capacity > 36000) throw new RangeError('capacity must be an integer from 2 to 36000');
    if (!Number.isFinite(targetFps) || targetFps < 1 || targetFps > 1000) throw new RangeError('targetFps must be from 1 to 1000');
    const times = new Float64Array(capacity);
    const counts = counterNames.map(() => new Float64Array(capacity));
    let previous = null, cursor = 0, size = 0;

    function recordFrame(timestampMs, counters) {
      if (!Number.isFinite(timestampMs) || timestampMs < 0) throw new RangeError('timestampMs must be a finite non-negative millisecond timestamp');
      if (counters !== undefined && counters !== null && (typeof counters !== 'object' || Array.isArray(counters))) throw new TypeError('counters must be an object');
      if (previous === null) { previous = timestampMs; return false; }
      if (timestampMs <= previous) return false;
      times[cursor] = timestampMs - previous;
      for (let index = 0; index < counts.length; index++) counts[index][cursor] = countValue(counters?.[counterNames[index]]);
      previous = timestampMs;
      cursor = (cursor + 1) % capacity;
      size = Math.min(capacity, size + 1);
      return true;
    }

    function snapshot({ includeSamples = false } = {}) {
      const durations = [], columns = counterNames.map(() => []), rawSamples = [];
      for (let offset = 0; offset < size; offset++) {
        const slot = (cursor - size + offset + capacity) % capacity;
        durations.push(times[slot]);
        const row = includeSamples ? { frameMs: times[slot] } : null;
        for (let index = 0; index < counts.length; index++) {
          const value = counts[index][slot];
          columns[index].push(value);
          if (row) row[counterNames[index]] = Number.isFinite(value) ? value : null;
        }
        if (row) rawSamples.push(row);
      }
      const sorted = durations.slice().sort((a, b) => a - b);
      const elapsedMs = durations.reduce((sum, value) => sum + value, 0);
      const thresholdMs = 1.5 * 1000 / targetFps;
      const jankCount = durations.filter(value => value > thresholdMs).length;
      const result = {
        schema: 'graf-frame-metrics', version: 1, capacity, sampleCount: size, elapsedMs,
        fps: size ? size * 1000 / elapsedMs : null,
        frameTimeMs: {
          mean: size ? elapsedMs / size : null,
          p50: nearestRank(sorted, 0.5), p95: nearestRank(sorted, 0.95), p99: nearestRank(sorted, 0.99),
          min: size ? sorted[0] : null, max: size ? sorted[size - 1] : null,
        },
        jank: { thresholdMs, count: jankCount, ratio: size ? jankCount / size : null },
        drawCalls: summary(columns[0]), triangles: summary(columns[1]),
        lines: summary(columns[2]), points: summary(columns[3]),
      };
      if (includeSamples) result.rawSamples = rawSamples;
      return result;
    }

    return Object.freeze({
      recordFrame, snapshot,
      markDiscontinuity() { previous = null; },
      reset() { previous = null; cursor = 0; size = 0; },
    });
  }
  return Object.freeze({ createFrameMetrics });
});
