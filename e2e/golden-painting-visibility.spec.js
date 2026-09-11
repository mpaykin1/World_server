const { test, expect } = require('@playwright/test');

const worlds=['voxel-world','ai3d-voxel-city','cinematic-encounter','dark-void-scene'];

test.describe('Golden Painting user-visible contract',()=>{
  for(const world of worlds){
    test(`${world}: natural cycle is alive and depth grading is active`,async({page})=>{
      const errors=[]; page.on('pageerror',e=>errors.push(String(e)));
      await page.goto(`/apps/${world}/`,{waitUntil:'domcontentloaded'});
      await page.waitForFunction(()=>document.body?.dataset?.goldenPhase,{timeout:20000});
      const d=await page.evaluate(()=>window.GoldenPaintingAtmosphere?.diagnostics?.());
      expect(d?.cycleAlive).toBe(true);
      expect(d?.phase).toMatch(/day|sunset|night|sunrise/);
      const adapter=d?.adapters?.find(x=>x.worldId===location.pathname.split('/').filter(Boolean).pop());
      expect(adapter?.depthGrading).toBe(true);
      expect(adapter?.patchedMaterials||0).toBeGreaterThan(0);
      expect(errors.filter(e=>/cycleStartedAt|GoldenPainting/i.test(e))).toEqual([]);
    });
  }

  test('forced phases are visibly different on Voxel World',async({page})=>{
    await page.goto('/apps/voxel-world/?goldenPhase=day',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body?.dataset?.goldenPhase==='day');
    const day=await page.evaluate(()=>window.GoldenPaintingAtmosphere.currentState());
    await page.goto('/apps/voxel-world/?goldenPhase=night',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>document.body?.dataset?.goldenPhase==='night');
    const night=await page.evaluate(()=>window.GoldenPaintingAtmosphere.currentState());
    expect(day.skyCss).not.toBe(night.skyCss);
    expect(day.brightness-night.brightness).toBeGreaterThan(.2);
    expect(night.nightVisibility).toBeGreaterThan(.9);
  });
});
