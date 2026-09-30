const { test, expect } = require('@playwright/test');

test('Roblox Gothic Rocks MVP is graphics-first and throws a physical rock', async ({ page }) => {
  const pageErrors=[]; page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.goto('/apps/roblox-gothic-rocks/', { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.__ROBLOX_PORT_MVP__?.ready === true, null, { timeout: 20000 });
  const initial=await page.evaluate(()=>({...window.__ROBLOX_PORT_MVP__,throwRock:undefined,fireTest:undefined}));
  expect(initial.visibilityPercent).toBeGreaterThanOrEqual(85);
  expect(initial.qualityFloor).toBeGreaterThanOrEqual(85);
  expect(initial.externalRobloxAssetsUsed).toBe(0);
  expect(initial.avatar).toBe('kaykit-knight-rig-medium');
  expect(initial.characterRuntime).toBe('universal-player-character');
  const canvasBox=await page.locator('canvas').boundingBox();
  const viewport=page.viewportSize();
  expect(canvasBox.width*canvasBox.height/(viewport.width*viewport.height)).toBeGreaterThanOrEqual(.85);
  const before=initial.shots;
  await page.evaluate(()=>window.__ROBLOX_PORT_MVP__.fireTest());
  await page.waitForFunction(n=>window.__ROBLOX_PORT_MVP__.shots>n,before);
  await page.waitForFunction(()=>window.__ROBLOX_PORT_MVP__.impacts>0,null,{timeout:8000});
  expect(pageErrors).toEqual([]);
});
