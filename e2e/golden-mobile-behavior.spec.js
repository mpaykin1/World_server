const {test,expect}=require('@playwright/test');
test.describe('Behavioral mobile control',()=>{
  test('AI3D joystick produces real player movement',async({page},testInfo)=>{
    test.skip(!/mobile/i.test(testInfo.project.name),'mobile only');
    await page.goto('/apps/ai3d-voxel-city/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.AI3DVoxelRuntime?.stats?.().player?.playable,{timeout:25000});
    const pad=page.locator('#goldenMovePad');await expect(pad).toBeVisible();
    const before=await page.evaluate(()=>window.AI3DVoxelRuntime.stats().player);
    const box=await pad.boundingBox();expect(box).toBeTruthy();
    const cx=box.x+box.width/2,cy=box.y+box.height/2;
    await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx,cy-box.height*.36,{steps:4});await page.waitForTimeout(450);await page.mouse.up();
    const after=await page.evaluate(()=>window.AI3DVoxelRuntime.stats().player);
    expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(.03);
  });
  test('AI3D touch jump changes only player height',async({page},testInfo)=>{
    test.skip(!/mobile/i.test(testInfo.project.name),'mobile only');
    await page.goto('/apps/ai3d-voxel-city/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.AI3DVoxelRuntime?.stats().player.onGround);
    const before=await page.evaluate(()=>window.AI3DVoxelRuntime.stats().player);
    await page.locator('#goldenJump').tap();
    await expect.poll(()=>page.evaluate(()=>window.AI3DVoxelRuntime.stats().player.y)).toBeGreaterThan(before.y+.05);
    const after=await page.evaluate(()=>window.AI3DVoxelRuntime.stats().player);
    expect(after.x).toBeCloseTo(before.x,5);expect(after.z).toBeCloseTo(before.z,5);
  });
});
