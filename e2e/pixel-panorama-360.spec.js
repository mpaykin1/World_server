const { test, expect } = require('@playwright/test');
test('pixel panorama V4 viewer + multires + controls', async ({ page }) => {
  await page.goto('/apps/pixel-panorama-360/?manifest=/shared/panorama360/sample-pixel-world/manifest.json');
  await expect(page.locator('#status')).toContainText('Ready', { timeout: 45000 });
  await expect(page.locator('#stage')).toBeVisible();
  const box = await page.locator('#stage').boundingBox();
  expect(box).toBeTruthy();
  if (box) {
    await page.mouse.move(box.x + box.width * .5, box.y + box.height * .5);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * .72, box.y + box.height * .42, { steps: 12 });
    await page.mouse.up();
    await page.mouse.wheel(0, -200);
  }
  await page.locator('#qualitySelect').selectOption('desktop');
  await page.locator('#playBtn').click();
  await page.locator('#playBtn').click();
  const api = await page.evaluate(() => window.PixelPano360?.getView());
  expect(api).toBeTruthy();
  expect(typeof api.yaw).toBe('number');
});
