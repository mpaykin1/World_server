const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('capture real browser frame performance telemetry', async ({ page }) => {
  const started = Date.now();
  await page.goto('/apps/ai3d-voxel-city/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const s = window.AI3DVoxelRuntime?.stats();
    return s?.defaultCityLoaded === true && s?.chunks > 0 && s?.player;
  }, { timeout: 30000 });
  const startupMs = Date.now() - started;

  const perf = await page.evaluate(async () => {
    const deltas = [];
    let previous = performance.now();
    for (let i = 0; i < 150; i++) {
      await new Promise(resolve => requestAnimationFrame(now => {
        deltas.push(now - previous);
        previous = now;
        resolve();
      }));
    }
    const sorted = [...deltas].sort((a,b)=>a-b);
    const pick = q => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
    const average = deltas.reduce((a,b)=>a+b,0) / deltas.length;
    const stats = window.AI3DVoxelRuntime?.stats() || {};
    return {
      frameMs: { average, median: pick(0.5), p95: pick(0.95), max: sorted[sorted.length - 1] },
      fps: { average: 1000 / average, median: 1000 / pick(0.5), p05: 1000 / pick(0.95) },
      renderer: {
        drawCalls: Number(stats.renderer?.drawCalls || stats.drawCalls || 0),
        triangles: Number(stats.renderer?.triangles || stats.mesher?.surfaceTriangles || 0)
      }
    };
  });

  const report = { schemaVersion:1, generatedAt:new Date().toISOString(), startupMs, ...perf };
  fs.writeFileSync(path.join(process.cwd(), 'PERFORMANCE_TELEMETRY.json'), JSON.stringify(report, null, 2) + '\n');
  expect(report.fps.median).toBeGreaterThan(1);
  expect(report.frameMs.p95).toBeGreaterThan(0);
});
