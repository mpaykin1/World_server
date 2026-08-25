const {test,expect}=require('@playwright/test');

async function expectTouchTarget(locator){
  const box=await locator.boundingBox();expect(box).toBeTruthy();expect(box.width).toBeGreaterThanOrEqual(44);expect(box.height).toBeGreaterThanOrEqual(44);
}
test.describe('Golden UI + render contract',()=>{
  for(const app of ['catalog','voxel-world','ai3d-voxel-city']){
    test(`${app}: compact icon menu packs system UI`,async({page})=>{
      await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
      await expect(page.locator('#goldenToolbar')).toBeVisible();
      const buttons=page.locator('#goldenToolbar button');expect(await buttons.count()).toBeGreaterThanOrEqual(4);
      await expectTouchTarget(buttons.first());
      await buttons.first().click();
      await expect(page.locator('#goldenDrawer')).toHaveAttribute('aria-hidden','false');
    });
  }
  test('catalog system panels are not persistent overlays',async({page})=>{
    await page.goto('/apps/catalog/',{waitUntil:'domcontentloaded'});
    for(const sel of ['.app-title','.topHint','#miniMap']){
      const n=page.locator(sel).first();await expect(n).toHaveAttribute('data-golden-packed','true');
      expect(await n.evaluate(el=>!!el.closest('#goldenDrawer'))).toBe(true);
    }
  });
  test('voxel-world technical panels are packed',async({page})=>{
    await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});
    for(const sel of ['#vwHud','#vwHelp','#vwBack']){
      const n=page.locator(sel);await expect(n).toHaveAttribute('data-golden-packed','true');
      expect(await n.evaluate(el=>!!el.closest('#goldenDrawer'))).toBe(true);
    }
  });
  test('AI3D system/editor panels are packed while viewer remains available',async({page})=>{
    await page.goto('/apps/ai3d-voxel-city/',{waitUntil:'domcontentloaded'});
    for(const sel of ['header','.controls','.metrics']) expect(await page.locator(sel).first().evaluate(el=>!!el.closest('#goldenDrawer'))).toBe(true);
    await expect(page.locator('#viewer')).toBeVisible();
  });
  test('certified render surfaces are visible and not CSS blurred',async({page})=>{
    for(const app of ['voxel-world','ai3d-voxel-city']){
      await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
      await page.waitForSelector('canvas',{state:'visible',timeout:25000});
      const info=await page.locator('canvas').first().evaluate(c=>{const s=getComputedStyle(c),r=c.getBoundingClientRect();return {w:r.width,h:r.height,filter:s.filter,opacity:Number(s.opacity)}}); 
      expect(info.w).toBeGreaterThan(250);expect(info.h).toBeGreaterThan(150);expect(info.filter==='none'||info.filter==='').toBe(true);expect(info.opacity).toBeGreaterThan(.9);
    }
  });
  test('mobile menu remains tappable inside safe UI',async({page},testInfo)=>{
    test.skip(!/mobile/i.test(testInfo.project.name),'mobile only');
    await page.goto('/apps/ai3d-voxel-city/',{waitUntil:'domcontentloaded'});
    const b=page.locator('#goldenToolbar button').first();await expectTouchTarget(b);await b.tap();await expect(page.locator('#goldenDrawer')).toHaveAttribute('aria-hidden','false');
  });
});

test.describe('Golden obstruction budget',()=>{
  test('obstruction-budget: closed system menu consumes under 12% of viewport',async({page})=>{
    await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});
    const ratio=await page.evaluate(()=>{
      const vp=innerWidth*innerHeight;let area=0;
      for(const el of document.querySelectorAll('#goldenToolbar, #goldenDrawer.open')){
        const r=el.getBoundingClientRect();area+=Math.max(0,r.width)*Math.max(0,r.height);
      }
      return area/Math.max(1,vp);
    });
    expect(ratio).toBeLessThan(.12);
  });
  test('escape-close: Escape closes system drawer',async({page})=>{
    await page.goto('/apps/catalog/',{waitUntil:'domcontentloaded'});
    await page.locator('#goldenToolbar button').first().click();
    await page.keyboard.press('Escape');
    await expect(page.locator('#goldenDrawer')).toHaveAttribute('aria-hidden','true');
  });
  test('direct-world-selection: worlds menu exposes direct links',async({page})=>{
    await page.goto('/apps/catalog/',{waitUntil:'domcontentloaded'});
    await page.locator('[data-golden-tab="worlds"]').click();
    await expect(page.locator('#goldenWorldList')).toBeVisible();
  });
});
