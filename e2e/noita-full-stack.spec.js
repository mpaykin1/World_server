'use strict';

const { test, expect } = require('@playwright/test');

test('Noita full stack couples matter, visuals, character and structural collapse', async ({ page }) => {
  const pageErrors=[];
  page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.goto('/apps/noita-full-stack-mvp/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__NOITA_FULL_STACK__?.stats().dense.occupied>1000);

  const initial=await page.evaluate(()=>window.__NOITA_FULL_STACK__.stats());
  expect(initial.errors).toEqual([]);
  expect(initial.camera.cellPixels).toBeGreaterThanOrEqual(2);
  expect(initial.dense.occupied).toBeGreaterThan(1200);

  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.spawnSand());
  await page.waitForFunction(()=>window.__NOITA_FULL_STACK__.stats().dense.occupied>5000);
  const sand=await page.evaluate(()=>window.__NOITA_FULL_STACK__.stats());
  expect(sand.dense.active).toBeGreaterThan(0);

  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.reset());
  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.lavaWater());
  await page.waitForFunction(()=>{
    const s=window.__NOITA_FULL_STACK__.stats();
    return s.renderer.emissive>0&&s.particles.count>0;
  },null,{timeout:8000});
  const lava=await page.evaluate(()=>window.__NOITA_FULL_STACK__.stats());
  expect(lava.renderer.emissive).toBeGreaterThan(0);
  expect(lava.particles.count).toBeGreaterThan(0);

  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.reset());
  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.ignite());
  await page.waitForFunction(()=>window.__NOITA_FULL_STACK__.stats().renderer.emissive>0);
  const fire=await page.evaluate(()=>window.__NOITA_FULL_STACK__.stats());
  expect(fire.particles.count).toBeGreaterThan(0);

  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.reset());
  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.breakSupport());
  await page.waitForFunction(()=>window.__NOITA_FULL_STACK__.stats().rigid>0);
  const falling=await page.evaluate(()=>window.__NOITA_FULL_STACK__.stats());
  expect(falling.rigid).toBeGreaterThan(0);

  const before=await page.evaluate(()=>window.__NOITA_FULL_STACK__.player.x);
  await page.evaluate(()=>window.__NOITA_FULL_STACK__.player.move(1));
  await page.waitForTimeout(180);
  await page.evaluate(()=>window.__NOITA_FULL_STACK__.player.move(0));
  const after=await page.evaluate(()=>window.__NOITA_FULL_STACK__.player.x);
  expect(after).toBeGreaterThan(before);

  await page.evaluate(()=>window.__NOITA_FULL_STACK__.actions.spell());
  await page.waitForFunction(()=>window.__NOITA_FULL_STACK__.stats().particles.count>0);
  expect(pageErrors).toEqual([]);
});
