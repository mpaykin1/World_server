const {test,expect}=require('@playwright/test');

test.describe('Living Ink real-mesh WebGL NPR v3',()=>{
  test('renders real meshes with depth-tested hidden lines and no external requests',async({page},testInfo)=>{
    const external=[];
    page.on('request',request=>{
      const u=new URL(request.url());
      if((u.protocol==='http:'||u.protocol==='https:')&&!['localhost','127.0.0.1'].includes(u.hostname))external.push(request.url());
    });
    await page.goto('/apps/living-ink-office-v3/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__livingInkScene?.renderer==='three-webgl-npr-v3');
    const data=await page.evaluate(()=>({scene:window.__livingInkScene,metrics:window.__livingInkMetrics,standalone:window.__LIVING_INK_STANDALONE__}));
    expect(data.standalone).toBe(true);
    expect(data.scene.realMeshes).toBe(true);
    expect(data.scene.hiddenLine).toBe(true);
    expect(data.scene.humans).toBeGreaterThanOrEqual(10);
    expect(data.scene.qualitySystems).toHaveLength(10);
    expect(data.metrics.depthTest).toBe(true);
    expect(data.metrics.hiddenLine).toBe(true);
    expect(data.metrics.triangles).toBeGreaterThan(0);
    expect(data.metrics.drawCalls).toBeGreaterThan(0);
    expect(external).toEqual([]);
    await page.screenshot({path:testInfo.outputPath('living-ink-webgl-v3.png'),fullPage:true});
  });

  test('walkthrough movement and architectural FRAME camera both work',async({page})=>{
    await page.goto('/apps/living-ink-office-v3/',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__livingInkScene?.renderer==='three-webgl-npr-v3');
    const before=await page.evaluate(()=>window.__livingInkScene.camera);
    await page.keyboard.down('w');await page.waitForTimeout(450);await page.keyboard.up('w');
    const moved=await page.evaluate(()=>window.__livingInkScene.camera);
    expect(moved.z).toBeGreaterThan(before.z);
    const frame=page.locator('.li-frame');await expect(frame).toBeVisible();await frame.click();
    await page.waitForFunction(()=>window.__livingInkScene?.cameraMode==='illustration');
    const illustrated=await page.evaluate(()=>window.__livingInkScene);
    expect(illustrated.cameraMode).toBe('illustration');
    await page.context().setOffline(true);
    await page.waitForTimeout(250);
    const aliveOffline=await page.evaluate(()=>window.__livingInkMetrics?.fps>0&&window.__livingInkScene?.renderer==='three-webgl-npr-v3');
    expect(aliveOffline).toBe(true);
  });

  test('canvas covers the viewport and exposes measured runtime telemetry',async({page})=>{
    await page.goto('/apps/living-ink-office-v3/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(900);
    const box=await page.locator('#living-ink').boundingBox();
    const vp=page.viewportSize();
    expect(box.width).toBeGreaterThanOrEqual(vp.width*.98);
    expect(box.height).toBeGreaterThanOrEqual(vp.height*.98);
    const m=await page.evaluate(()=>window.__livingInkMetrics);
    expect(m.fps).toBeGreaterThan(0);
    expect(m.p95FrameMs).toBeGreaterThanOrEqual(0);
  });
});
