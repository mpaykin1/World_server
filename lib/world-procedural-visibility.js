'use strict';

function clamp(v, a, b) { return Math.max(a, Math.min(b, Number(v))); }
function distance2D(a, b) { return Math.hypot(Number(a.x || 0) - Number(b.x || 0), Number(a.z || 0) - Number(b.z || 0)); }

function lodForDistance(distance, chunkWorldSize = 16, qualityScale = 1) {
  const q = clamp(qualityScale || 1, 0.35, 1.25);
  const d = distance / Math.max(1, chunkWorldSize);
  if (d <= 2.5 * q) return 0;
  if (d <= 5.5 * q) return 1;
  if (d <= 10 * q) return 2;
  return 3;
}

function planVisibility(chunks = [], camera = {}, budget = {}, options = {}) {
  const chunkSize = Math.max(4, Number(options.chunkWorldSize || 16));
  const qualityScale = clamp(options.qualityScale || 1, 0.35, 1.25);
  const maxVisible = Math.max(1, Math.trunc(Number(budget.maxVisibleChunks || budget.chunkRadius * budget.chunkRadius * 4 || 64)));
  const farDistance = Math.max(chunkSize * 2, Number(options.farDistance || chunkSize * Math.max(8, (budget.chunkRadius || 4) * 2.5)));
  const occlusionTest = typeof options.occlusionTest === 'function' ? options.occlusionTest : null;
  const candidates = [];

  for (const chunk of chunks) {
    const x = Number(chunk.x || 0), z = Number(chunk.z || 0);
    const center = { x: x * chunkSize + chunkSize / 2, z: z * chunkSize + chunkSize / 2 };
    const distance = distance2D(center, camera);
    if (distance > farDistance) continue;
    if (occlusionTest && occlusionTest(chunk, camera) === true) continue;
    const lod = lodForDistance(distance, chunkSize, qualityScale);
    const score = distance + lod * chunkSize * 0.35 - (chunk.priority || 0) * chunkSize;
    candidates.push({ ...chunk, center, distance: +distance.toFixed(3), lod, score });
  }

  candidates.sort((a, b) => a.score - b.score || a.x - b.x || a.z - b.z);
  const visible = candidates.slice(0, maxVisible).map(({ score, ...item }) => item);
  const visibleKeys = new Set(visible.map((c) => `${c.x},${c.z}`));
  return {
    visible,
    culledCount: Math.max(0, chunks.length - visible.length),
    maxVisible,
    farDistance,
    qualityScale,
    isVisible(x, z) { return visibleKeys.has(`${Math.trunc(x)},${Math.trunc(z)}`); }
  };
}

module.exports = { distance2D, lodForDistance, planVisibility };
