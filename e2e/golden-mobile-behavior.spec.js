const {test,expect}=require('@playwright/test');

const PLAYABLE_APPS=[
  { id: 'ai3d-voxel-city', url: '/apps/ai3d-voxel-city/' },
  { id: 'voxel-world', url: '/apps/voxel-world/' },
  { id: 'catalog', url: '/apps/catalog/' }
];

test.describe('Behavioral mobile control',()=>{
  for(const app of PLAYABLE_APPS){
    test(`${app.id}: mobile movement joystick produces real player movement`,async({page},testInfo)=>{
      test.skip(!/mobile/i.test(testInfo.project.name),'mobile only');
      await page.goto(app.url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});

      const pad=page.locator('#goldenMovePad, #movePad').first();
      await expect(pad).toBeVisible();
      const before=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
      const box=await pad.boundingBox();
      expect(box).toBeTruthy();

      const cx=box.x+box.width/2,cy=box.y+box.height/2;
      await page.mouse.move(cx,cy);
      await page.mouse.down();
      await page.mouse.move(cx,cy-box.height*.36,{steps:5});
      await page.waitForTimeout(450);
      await page.mouse.up();

      const after=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
      expect(Math.hypot(after.x-before.x,after.z-before.z)).toBeGreaterThan(.03);
    });

    test(`${app.id}: mobile camera/look control produces real yaw and pitch rotation`,async({page},testInfo)=>{
      test.skip(!/mobile/i.test(testInfo.project.name),'mobile only');
      await page.goto(app.url,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:25000});

      const look=page.locator('#goldenLookZone, #lookZone, .lookZone').first();
      await expect(look).toBeVisible();
      const lbox=await look.boundingBox();
      expect(lbox).toBeTruthy();

      const before=await page.evaluate(()=>{
        const p=window.GamePlayableRuntime.stats().player;
        return { yaw: p.yaw, pitch: p.pitch };
      });

      const cx=lbox.x+lbox.width/2,cy=lbox.y+lbox.height/2;
      await page.mouse.move(cx,cy);
      await page.mouse.down();
      await page.mouse.move(cx-60,cy-40,{steps:5});
      await page.waitForTimeout(300);
      await page.mouse.up();

      const after=await page.evaluate(()=>{
        const p=window.GamePlayableRuntime.stats().player;
        return { yaw: p.yaw, pitch: p.pitch };
      });

      const totalDelta = Math.abs(after.yaw - before.yaw) + Math.abs(after.pitch - before.pitch);
      expect(totalDelta).toBeGreaterThan(0.02);
    });
  }
});
