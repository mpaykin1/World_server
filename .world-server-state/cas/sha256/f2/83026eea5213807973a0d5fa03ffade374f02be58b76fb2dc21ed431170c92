const { test, expect } = require('@playwright/test');

test('iPhone WebKit profile connects all adaptive runtimes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'iPhone WebKit project only');
  await page.goto('/apps/voxel-world/', { waitUntil: 'domcontentloaded' });
  const state = await page.evaluate(() => ({
    ios: Boolean(window.WorldServerDeviceQuality?.state?.iosWebkit),
    profile: document.documentElement.dataset.worldQuality || '',
    graphics: Boolean(window.WorldServerGraphicsQuality),
    stutter: Boolean(window.WorldServerStutterProfiler),
    predictive: Boolean(window.WorldServerPredictiveStreaming),
    rig: Boolean(window.WorldServerRigAdapters),
    asset: Boolean(window.WorldServerAssetDelivery)
  }));
  expect(state.ios).toBeTruthy();
  expect(state.profile).toMatch(/^(performance|balanced|high|ultra)$/);
  expect(state.graphics && state.stutter && state.predictive && state.rig && state.asset).toBeTruthy();
});

test('iPhone WebKit keeps app usable after quality pressure event', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-webkit', 'iPhone WebKit project only');
  await page.goto('/apps/ai3d-voxel-city/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => dispatchEvent(new CustomEvent('worldserver:stutter', { detail: { stutterScore: 0.8, frameP95Ms: 70 } })));
  await expect.poll(() => page.evaluate(() => document.documentElement.dataset.worldGraphicsQuality || ''), { timeout: 5000 }).toMatch(/^(performance|balanced|high|ultra)$/);
  await expect(page.locator('body')).toBeVisible();
});
