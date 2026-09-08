'use strict';
const {test,expect}=require('@playwright/test');

async function boot(page){
  await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.GoldenUIShell&&window.VoxelWorldRuntime,{timeout:20000});
  await page.waitForTimeout(500);
}

test.describe('Golden mobile world experience',()=>{
  test('iPhone portrait has four-button top bar, two joysticks and reliable modal close',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='mobile-webkit');
    await boot(page);
    await expect(page.locator('#goldenToolbar button')).toHaveCount(4);
    await expect(page.locator('#movePad')).toBeVisible();
    await expect(page.locator('#lookPad')).toBeVisible();
    await page.locator('[data-golden-tab="worlds"]').click();
    await expect(page.locator('#goldenDrawer')).toHaveClass(/open/);
    await expect(page.locator('html')).toHaveClass(/golden-drawer-open/);
    const close=page.locator('#goldenDrawerClose'),box=await close.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(48); expect(box.height).toBeGreaterThanOrEqual(48);
    expect(await page.locator('#lookPad').evaluate(el=>getComputedStyle(el).pointerEvents)).toBe('none');
    await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await expect(page.locator('#goldenDrawer')).not.toHaveClass(/open/);
  });

  test('visible right joystick really changes camera yaw',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='mobile-webkit');
    await boot(page); const look=page.locator('#lookPad'); const box=await look.boundingBox();
    const before=await page.evaluate(()=>window.VoxelWorldRuntime.stats().player.yaw);
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2); await page.mouse.down();
    await page.mouse.move(box.x+box.width*.84,box.y+box.height/2,{steps:4}); await page.waitForTimeout(260);
    const after=await page.evaluate(()=>window.VoxelWorldRuntime.stats().player.yaw); await page.mouse.up();
    expect(Math.abs(after-before)).toBeGreaterThan(.02);
  });

  test('world newspaper survives /api/apps failure and exposes lore + connections in portrait and landscape',async({page},testInfo)=>{
    test.skip(testInfo.project.name!=='mobile-webkit');
    await page.route('**/api/apps?all=1',r=>r.fulfill({status:503,contentType:'application/json',body:'{"error":"forced regression"}'}));
    await boot(page); await page.locator('[data-golden-tab="worlds"]').click();
    await expect(page.locator('.goldenPaperCard')).toHaveCount(12);
    await expect(page.locator('a[href="https://dark-void-navigator.vercel.app/"]')).toHaveCount(1);
    await expect(page.locator('.goldenPaperCard video')).toHaveCount(12);
    await page.locator('[data-world-view="connections"]').click();
    await expect(page.locator('#goldenConnections select')).toHaveCount(2);
    await expect(page.locator('.goldenBridgeStory')).not.toBeEmpty();
    await page.locator('[data-golden-tab="info"]').click();
    await expect(page.locator('.goldenLoreHistory')).toHaveCount(1);
    expect((await page.locator('#goldenLore').innerText()).length).toBeGreaterThan(100);
    await page.setViewportSize({width:844,height:390});
    await page.locator('[data-golden-tab="worlds"]').click();
    await expect(page.locator('.goldenPaperCard')).toHaveCount(12);
    const close=page.locator('#goldenDrawerClose'),box=await close.boundingBox(); await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
    await expect(page.locator('#goldenDrawer')).not.toHaveClass(/open/);
  });
});
