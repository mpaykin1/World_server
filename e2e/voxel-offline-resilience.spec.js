const { test, expect } = require('@playwright/test');

test('Voxel World stays playable when backend config is unavailable', async ({ page }) => {
  await page.route('**/api/config', route => route.fulfill({
    status: 503,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Supabase public environment variables are not configured.' })
  }));
  await page.goto('/apps/voxel-world/');
  await page.waitForFunction(() => window.VoxelWorldRuntime?.stats?.().playable === true, null, { timeout: 15000 });
  const stats = await page.evaluate(() => window.VoxelWorldRuntime.stats());
  expect(stats.backendMode).toBe('offline');
  expect(stats.chunks).toBeGreaterThan(0);
  // The Three.js renderer canvas (marked by golden-painting-atmosphere). A bare 'canvas' locator
  // also matches the click-through Phaser FX layer canvas and fails Playwright's strict mode.
  await expect(page.locator('canvas[data-golden-three="1"]')).toBeVisible();
  await expect(page.locator('#loading')).toHaveClass(/hidden/);
});
