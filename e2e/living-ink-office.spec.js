const {test,expect}=require('@playwright/test');
test.describe('Living Ink ASQURA standalone vertical slice',()=>{
  test('renders three distinct office employees without external requests',async({page})=>{
    const external=[];
    page.on('request',request=>{const u=new URL(request.url());if(u.protocol==='http:'||u.protocol==='https:'){if(!['localhost','127.0.0.1'].includes(u.hostname))external.push(request.url());}});
    await page.goto('/apps/living-ink-office/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__livingInkScene?.people?.length>=3&&window.__livingInkMetrics?.standalone===true);
    const scene=await page.evaluate(()=>window.__livingInkScene);
    expect(scene.people.length).toBeGreaterThanOrEqual(3);
    expect(new Set(scene.people.map(p=>`${p.height.toFixed(3)}:${p.build.toFixed(3)}:${p.suit}:${p.accessory}`)).size).toBeGreaterThanOrEqual(3);
    expect(scene.actions).toEqual(expect.arrayContaining(['walk','sit','type','coffee']));
    expect(scene.lodLevels.length).toBeGreaterThanOrEqual(2);
    expect(external).toEqual([]);
    const canvas=page.locator('#living-ink');await expect(canvas).toBeVisible();
    const box=await canvas.boundingBox();expect(box.width).toBeGreaterThan(300);expect(box.height).toBeGreaterThan(300);
  });
  test('exposes measured runtime telemetry without inventing an FPS claim',async({page})=>{
    await page.goto('/apps/living-ink-office/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(750);
    const m=await page.evaluate(()=>window.__livingInkMetrics);
    expect(m.fps).toBeGreaterThan(0);expect(m.p95FrameMs).toBeGreaterThanOrEqual(0);expect(m.drawCalls).toBeGreaterThan(0);expect(m.primitives).toBeGreaterThan(0);
  });
});
