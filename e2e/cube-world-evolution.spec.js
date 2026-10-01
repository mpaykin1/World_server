const { test, expect } = require('@playwright/test');
const { PNG } = require('pngjs');

function pixelDifferenceRatio(a,b){
  const left=PNG.sync.read(a),right=PNG.sync.read(b);
  if(left.width!==right.width||left.height!==right.height)return 1;
  let changed=0,total=left.width*left.height;
  for(let i=0;i<left.data.length;i+=4){
    const delta=Math.abs(left.data[i]-right.data[i])+Math.abs(left.data[i+1]-right.data[i+1])+Math.abs(left.data[i+2]-right.data[i+2]);
    if(delta>60)changed+=1;
  }
  return changed/Math.max(1,total);
}

test('Cube World Evolution visibly grows from one cube on a locked graphics-first viewport',async({page})=>{
  const pageErrors=[];page.on('pageerror',e=>pageErrors.push(String(e)));
  await page.goto('/apps/cube-world-evolution-mvp/?autoplay=0',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__WORLD_EVOLUTION_EVIDENCE__?.ready===true,null,{timeout:20000});

  const viewport=page.viewportSize(),canvasBox=await page.locator('canvas').boundingBox();
  expect(canvasBox.width*canvasBox.height/(viewport.width*viewport.height)).toBeGreaterThanOrEqual(.85);
  const locked=await page.evaluate(()=>({
    scrollX,scrollY,scrollHeight:document.documentElement.scrollHeight,
    innerHeight,overflow:getComputedStyle(document.body).overflow,
    touchAction:getComputedStyle(document.querySelector('canvas')).touchAction
  }));
  expect(locked.scrollX).toBe(0);expect(locked.scrollY).toBe(0);
  expect(locked.scrollHeight).toBeLessThanOrEqual(locked.innerHeight+2);
  expect(locked.overflow).toBe('hidden');expect(locked.touchAction).toBe('none');

  const initial=await page.evaluate(()=>({...window.__WORLD_EVOLUTION_EVIDENCE__}));
  expect(initial.initialPrimitiveCount).toBe(1);
  expect(initial.stage).toBe('cube');
  expect(initial.seedCubeVisible).toBe(true);
  expect(initial.visibleGeneratedObjects).toBe(0);
  expect(initial.visibilityPercent).toBeGreaterThanOrEqual(85);
  const initialShot=await page.screenshot();

  const middle=await page.evaluate(()=>window.__WORLD_EVOLUTION_CONTROL__.seek(.42));
  expect(middle.progress).toBeCloseTo(.42,2);
  expect(middle.visibleGeneratedObjects).toBeGreaterThan(40);

  const final=await page.evaluate(()=>window.__WORLD_EVOLUTION_CONTROL__.seek(1));
  expect(final.stage).toBe('final');
  expect(final.seedCubeVisible).toBe(false);
  expect(final.lifeActive).toBe(true);
  expect(final.visibleGeneratedObjects).toBeGreaterThan(300);
  expect(final.visibilityPercent).toBeGreaterThanOrEqual(85);
  const finalShot=await page.screenshot();
  expect(pixelDifferenceRatio(initialShot,finalShot)).toBeGreaterThan(.08);
  expect(pageErrors).toEqual([]);
});
