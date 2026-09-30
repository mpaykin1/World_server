const { test, expect } = require('@playwright/test');

test.describe('Voxel Art Renderer MVP',()=>{
  test('boots a non-empty rendered game with World Server render stack',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('/apps/voxel-art-render-mvp/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__VOXEL_ART_MVP__?.ready,{timeout:20000});
    await page.waitForTimeout(1200);
    const result=await page.evaluate(()=>({snap:window.__VOXEL_ART_MVP__.snapshot(),pixel:window.__VOXEL_ART_MVP__.sampleCenter(),golden:window.GoldenPaintingAtmosphere?.diagnostics?.()}));
    expect(result.snap.total).toBe(5);
    expect(result.snap.renderCalls).toBeGreaterThan(0);
    expect(result.snap.triangles).toBeGreaterThan(100);
    expect(result.snap.microdetail?.shaderMaterials).toBeGreaterThan(0);
    expect(result.pixel[3]).toBeGreaterThan(0);
    expect(result.golden?.cycleAlive).toBe(true);
    expect(errors).toEqual([]);
  });
  test('collection loop opens portal and reaches win state',async({page})=>{
    await page.goto('/apps/voxel-art-render-mvp/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__VOXEL_ART_MVP__?.ready,{timeout:20000});
    const won=await page.evaluate(()=>{
      const api=window.__VOXEL_ART_MVP__;
      api.collectAllForTest();api.teleportToBeacon();return api.step(.05);
    });
    expect(won.collected).toBe(5);
    expect(won.won).toBe(true);
    expect(await page.locator('#objective').innerText()).toContain('Победа');
  });

  test('touch controls are present on mobile viewport',async({page,isMobile})=>{
    test.skip(!isMobile,'mobile-only UI check');
    await page.goto('/apps/voxel-art-render-mvp/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__VOXEL_ART_MVP__?.ready,{timeout:20000});
    await expect(page.locator('#movePad')).toBeVisible();
    await expect(page.locator('#lookPad')).toBeVisible();
    await expect(page.locator('#shootBtn')).toBeVisible();
  });
});
