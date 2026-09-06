const { test, expect } = require('@playwright/test');

test.describe('World Server Golden Standard', () => {
  test('public app API is deny-by-default and returns certified apps only', async ({ request }) => {
    const r = await request.get('/api/apps?certified=1');
    expect(r.ok()).toBeTruthy();
    const j = await r.json();
    expect(j.releasePolicy).toBe('deny-by-default');
    expect(j.goldenStandard).toBeTruthy();
    expect(j.apps.length).toBeGreaterThan(0);
    for (const app of j.apps) expect(app.status).toBe('certified');
    const ids = j.apps.map(a=>a.id);
    expect(ids).not.toContain('ai3d-reference-test');
    expect(ids).not.toContain('survival');
    expect(ids).not.toContain('world-sharabass');
  });

  test('catalog has direct tap/click world selection; walking to a portal is never required', async ({ page, isMobile }) => {
    await page.goto('/apps/catalog/', {waitUntil:'domcontentloaded'});
    const menu = page.locator('#goldenWorldMenu');
    await expect(menu).toBeVisible();
    const links = menu.locator('a[data-app-id]');
    expect(await links.count()).toBeGreaterThan(0);
    const href = await links.first().getAttribute('href');
    expect(href).toMatch(/^\/apps\/[^/]+\/$/);
    if(isMobile) await links.first().tap(); else await links.first().click();
    await expect(page).toHaveURL(new RegExp(href.replaceAll('/', '\\/')+'$'));
  });

  test('canonical basis always maps right to screen-right', async ({ page }) => {
    await page.goto('/apps/ai3d-voxel-city/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.GameGoldenStandard?.basisFromForward);
    const cases = await page.evaluate(() => {
      const b=window.GameGoldenStandard.basisFromForward;
      return [
        b(0,-1),   // camera forward -Z => right +X
        b(-1,0),   // camera forward -X => right -Z
        b(0,1),    // camera forward +Z => right -X
        b(1,0)     // camera forward +X => right +Z
      ];
    });
    expect(cases[0].right.x).toBeCloseTo(1,5);
    expect(cases[0].right.z).toBeCloseTo(0,5);
    expect(cases[1].right.x).toBeCloseTo(0,5);
    expect(cases[1].right.z).toBeCloseTo(-1,5);
    expect(cases[2].right.x).toBeCloseTo(-1,5);
    expect(cases[3].right.z).toBeCloseTo(1,5);
  });

  test('AI3D playable runtime loads a real scene and W moves in canonical forward direction', async ({ page }) => {
    await page.goto('/apps/ai3d-voxel-city/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(() => {
      const s=window.AI3DVoxelRuntime?.stats?.();
      return s?.defaultCityLoaded && s?.player?.playable;
    }, {timeout:25000});
    await page.evaluate(()=>window.AI3DVoxelRuntime.setPlayerView?.(0,0));
    const before=await page.evaluate(()=>window.AI3DVoxelRuntime.stats().player);
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(350);
    await page.keyboard.up('KeyW');
    const after=await page.evaluate(()=>window.AI3DVoxelRuntime.stats().player);
    const dz=after.z-before.z, dx=after.x-before.x;
    expect(Math.hypot(dx,dz)).toBeGreaterThan(0.03);
    expect(dz).toBeLessThan(0); // Three.js camera yaw 0 looks toward -Z
  });

  test('mobile project exposes touch movement + touch look', async ({ page }, testInfo) => {
    test.skip(!/mobile/i.test(testInfo.project.name), 'mobile-only behavioral contract');
    await page.goto('/apps/ai3d-voxel-city/', {waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.GameGoldenStandard?.state?.mobileReady === true);
    await expect(page.locator('#goldenMobileControls')).toBeVisible();
    await expect(page.locator('#goldenMovePad')).toBeVisible();
    await expect(page.locator('#goldenLookZone')).toBeVisible();
    expect(await page.evaluate(()=>window.GameGoldenStandard.state.touchControls)).toBe(true);
  });
});
