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
  // The transparent Phaser FX layer owns another canvas; test the game surface.
  const renderer = page.locator('canvas[data-golden-three="1"]');
  await expect(renderer).toHaveCount(1);
  await expect(renderer).toBeVisible();
  await expect(page.locator('#loading')).toHaveClass(/hidden/);
});
