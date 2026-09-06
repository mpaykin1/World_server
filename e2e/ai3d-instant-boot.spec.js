const {test,expect}=require('@playwright/test');

test('AI3D stays graphical and controllable when full asset and Web Worker fail',async({page})=>{
  await page.route('**/apps/ai3d-voxel-city/default-city.json',r=>r.abort());
  await page.route('**/apps/ai3d-voxel-city/mesher-worker.js',r=>r.abort());
  const errors=[]; page.on('pageerror',e=>errors.push(String(e.message||e)));
  await page.goto('/apps/ai3d-voxel-city/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.GamePlayableRuntime?.stats?.().player?.playable,{timeout:10000});
  const before=await page.evaluate(()=>window.GamePlayableRuntime.stats());
  expect(before.bootWorldLoaded).toBe(true);
  expect(before.voxels).toBeGreaterThan(1000);
  expect(before.chunks).toBeGreaterThan(0);
  expect(before.renderer?.triangles||0).toBeGreaterThan(0);
  await page.keyboard.down('KeyW'); await page.waitForTimeout(300); await page.keyboard.up('KeyW');
  const afterW=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
  expect(Math.hypot(afterW.x-before.player.x,afterW.z-before.player.z)).toBeGreaterThan(.05);
  await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
  const afterArrow=await page.evaluate(()=>window.GamePlayableRuntime.stats().player);
  expect(Math.hypot(afterArrow.x-afterW.x,afterArrow.z-afterW.z)).toBeGreaterThan(.05);
  expect(errors).toEqual([]);
});
