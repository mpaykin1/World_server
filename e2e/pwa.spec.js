const { test, expect } = require('@playwright/test');

test('catalog exposes a valid installable PWA surface', async ({ page, request }) => {
  await page.goto('/apps/catalog/', { waitUntil: 'domcontentloaded' });

  const manifestHref = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(manifestHref).toContain('/api/pwa-manifest?app=catalog');

  const manifestResponse = await request.get(manifestHref);
  expect(manifestResponse.ok()).toBeTruthy();
  expect(manifestResponse.headers()['content-type']).toContain('application/manifest+json');
  const manifest = await manifestResponse.json();
  expect(manifest.scope).toBe('/apps/catalog/');
  expect(manifest.display).toBe('standalone');

  const sw = await request.get('/sw.js');
  expect(sw.ok()).toBeTruthy();
  expect(sw.headers()['service-worker-allowed']).toBe('/');

  const runtimePresent = await page.evaluate(() => Boolean(window.WorldServerPWA));
  expect(runtimePresent).toBeTruthy();
});

test('PWA runtime reports an adaptive quality profile', async ({ page }) => {
  await page.goto('/apps/ai3d-voxel-city/', { waitUntil: 'domcontentloaded' });
  await expect.poll(
    () => page.evaluate(() => document.documentElement.dataset.worldQuality || ''),
    { timeout: 10000 }
  ).toMatch(/^(performance|balanced|high|ultra)$/);
});

test('device, graphics and semantic animation quality runtimes are connected', async ({ page }) => {
  await page.goto('/apps/catalog/', { waitUntil: 'domcontentloaded' });
  const state = await page.evaluate(() => ({
    device: Boolean(window.WorldServerDeviceQuality),
    graphics: Boolean(window.WorldServerGraphicsQuality),
    animation: Boolean(window.WorldServerAnimationQuality),
    graphicsProfile: document.documentElement.dataset.worldGraphicsQuality || ''
  }));
  expect(state.device).toBeTruthy();
  expect(state.graphics).toBeTruthy();
  expect(state.animation).toBeTruthy();
  expect(state.graphicsProfile).toMatch(/^(performance|balanced|high|ultra)$/);
});

test('manifest advertises production-size app icons', async ({ request }) => {
  const response = await request.get('/api/pwa-manifest?app=catalog');
  expect(response.ok()).toBeTruthy();
  const manifest = await response.json();
  expect(manifest.icons.some(icon => icon.sizes === '192x192')).toBeTruthy();
  expect(manifest.icons.some(icon => icon.sizes === '512x512')).toBeTruthy();
});
