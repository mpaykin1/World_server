const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('runtime telemetry bridge captures real player/render samples', async ({ page }) => {
  await page.goto('/apps/ai3d-voxel-city/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.AI3DVoxelRuntime?.stats()?.defaultCityLoaded === true, { timeout:30000 });
  await page.addScriptTag({ url:'/shared/quality/runtime-telemetry.js' });
  await page.waitForFunction(() => window.WorldQualityTelemetry?.state?.samples?.length >= 5, { timeout:5000 });
  const snap = await page.evaluate(() => window.WorldQualityTelemetry.snapshot());
  fs.writeFileSync(path.join(process.cwd(),'RUNTIME_TELEMETRY.json'), JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),...snap},null,2)+'\n');
  expect(snap.samples.length).toBeGreaterThanOrEqual(5);
  expect(Number.isFinite(snap.samples.at(-1).player.x)).toBe(true);
});
