const {test,expect}=require('@playwright/test');

test.describe('DreamFog World',()=>{
  test('loads, renders and exposes runtime contract',async({page})=>{
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/apps/dreamfog-world/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__DREAMFOG_STATE__?.ready===true,null,{timeout:15000});
    const state=await page.evaluate(()=>window.__DREAMFOG_STATE__);
    expect(state.render).toBe(true);expect(state.walkable).toBe(true);expect(state.collisions).toBe(true);expect(state.grounding).toBe(true);expect(state.playerSpawn).toBe(true);
    expect(state.atmosphere.fogBanks).toBeGreaterThanOrEqual(3);expect(state.atmosphere.creatures).toBeGreaterThanOrEqual(12);expect(state.atmosphere.particles).toBeGreaterThanOrEqual(700);expect(errors).toEqual([]);
    await expect(page.locator('canvas')).toBeVisible();
  });
  test('canonical controls do not break runtime',async({page})=>{
    await page.goto('/apps/dreamfog-world/');await page.waitForFunction(()=>window.__DREAMFOG_STATE__?.ready===true);
    await page.keyboard.down('KeyW');await page.waitForTimeout(450);await page.keyboard.up('KeyW');
    await page.keyboard.press('Space');await page.waitForTimeout(180);
    const state=await page.evaluate(()=>window.__DREAMFOG_STATE__);expect(state.errors).toEqual([]);expect(state.ready).toBe(true);
  });
});
