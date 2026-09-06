const {test,expect}=require('@playwright/test');

test('voxel chunk failures back off instead of retrying every frame',async({page})=>{
  let attempts=0;
  await page.route('**/api/voxel',async route=>{
    if(route.request().postDataJSON()?.action==='chunks')attempts++;
    await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Readiness test: backend unavailable'})});
  });
  await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoxelWorldRuntime);
  await expect.poll(()=>attempts).toBeGreaterThan(0);
  await page.waitForTimeout(4500);
  expect(attempts).toBeLessThanOrEqual(3);
  await expect(page.locator('#vwStatus')).toContainText('backend unavailable');
});

test('voxel ArrowUp moves the player with the same forward basis as W',async({page})=>{
  await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.VoxelWorldRuntime?.stats().player.onGround);
  await page.evaluate(()=>window.VoxelWorldRuntime.setView(0,0));
  const before=await page.evaluate(()=>window.VoxelWorldRuntime.stats().player);
  await page.keyboard.down('ArrowUp');await page.waitForTimeout(250);await page.keyboard.up('ArrowUp');
  const after=await page.evaluate(()=>window.VoxelWorldRuntime.stats().player);
  expect(after.z-before.z).toBeLessThan(-.01);
});
