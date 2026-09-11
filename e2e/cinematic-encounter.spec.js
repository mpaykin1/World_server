const { test, expect } = require('@playwright/test');
const { PNG } = require('pngjs');

function visualRange(buffer){
  const png=PNG.sync.read(buffer); let min=255,max=0;
  for(let i=0;i<png.width*png.height;i+=Math.max(1,Math.floor(png.width*png.height/1800))){const k=i*4;const v=(png.data[k]+png.data[k+1]+png.data[k+2])/3;min=Math.min(min,v);max=Math.max(max,v);} return max-min;
}

test('cinematic encounter renders, moves and exposes the Golden worlds inventory',async({page,isMobile})=>{
  await page.goto('/apps/cinematic-encounter/');
  await page.waitForFunction(()=>window.__CINEMATIC_ENCOUNTER_READY__?.ready===true);
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.locator('#goldenToolbar')).toBeVisible();
  const inventory=await page.waitForFunction(()=>window.GoldenUIShell?.getInventory?.().length>0&&window.GoldenUIShell.getInventory()).then(h=>h.jsonValue());
  expect(inventory.some(x=>x.id==='cinematic-encounter')).toBeTruthy();
  const before=await page.evaluate(()=>window.__CINEMATIC_ENCOUNTER_READY__.snapshot());
  if(!isMobile){await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');const moved=await page.evaluate(()=>window.__CINEMATIC_ENCOUNTER_READY__.snapshot());expect(Math.hypot(moved.player[0]-before.player[0],moved.player[2]-before.player[2])).toBeGreaterThan(.1);await page.keyboard.press('Space');await page.waitForTimeout(120);const jumped=await page.evaluate(()=>window.__CINEMATIC_ENCOUNTER_READY__.snapshot());expect(jumped.player[1]).toBeGreaterThan(0);}
  else {await expect(page.locator('#movePad')).toBeVisible();await expect(page.locator('#lookPad')).toBeVisible();await expect(page.locator('#jumpBtn')).toBeVisible();}
  expect(visualRange(await page.screenshot())).toBeGreaterThan(12);
});
