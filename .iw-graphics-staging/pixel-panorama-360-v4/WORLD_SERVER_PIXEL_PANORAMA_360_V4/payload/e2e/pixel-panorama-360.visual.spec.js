const { test, expect } = require('@playwright/test');
test('pixel panorama visual candidate is stable', async ({ page }) => {
  await page.goto('/apps/pixel-panorama-360/?manifest=/shared/panorama360/sample-pixel-world/manifest.json');
  await expect(page.locator('#status')).toContainText('Ready', { timeout: 45000 });
  await page.locator('#hud').evaluate(el => { el.style.display = 'none'; });
  await page.waitForTimeout(800);
  await expect(page).toHaveScreenshot('pixel-panorama-360-sample.png', { animations: 'disabled', maxDiffPixelRatio: 0.03 });
});
