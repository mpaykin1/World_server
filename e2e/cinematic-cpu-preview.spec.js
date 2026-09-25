'use strict';
const {test,expect}=require('@playwright/test');
test.describe('Optional CPU-generated cinematic pack (real browser)',()=>{
  test('opt-in loads authenticated-by-SHA geometry without replacing the engine',async({page},info)=>{
    test.setTimeout(65000);
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('/apps/ai3d-voxel-city/?cinematicCpu=1&goldenPhase=night');
    await page.waitForFunction(()=>window.AI3DCinematicPack?.status||
      window.__AI3D_CINEMATIC_CPU_ERROR__,null,{timeout:50000});
    const state=await page.evaluate(()=>{
      const p=window.AI3DCinematicPack,s=window.AI3DVoxelRuntime?.stats?.();
      return{
        error:window.__AI3D_CINEMATIC_CPU_ERROR__||null,
        worldLoaded:s?.defaultCityLoaded,voxels:s?.voxels,
        playerWorldStillLoaded:s?.chunks>0,
        pack:p?.stats?.(),
        meshes:p?Object.values(p.loaded).reduce((total,lod)=>{
          lod.traverse(o=>{if(o.isMesh)total++;});return total;
        },0):0
      };
    });
    expect(state.error).toBeNull();
    expect(state.worldLoaded).toBe(true);
    expect(state.voxels).toBeGreaterThan(30000);
    expect(state.playerWorldStillLoaded).toBe(true);
    expect(state.pack.status).toBe('READY_VISUAL_ONLY_NOT_LIVE_VERIFIED');
    expect(state.pack.collisionIntegrated).toBe(false);
    expect(state.pack.playerVisibilityCertified).toBe(false);
    expect(state.meshes).toBeGreaterThan(3);
    expect(state.pack.geometryDrawCallUpperBound).toBeLessThanOrEqual(6);
    expect(state.pack.optimizedReady).toBe(true);
    expect(state.pack.optimizedFallbacks).toEqual([]);
    expect(state.pack.optimizedLoaded).toBe(state.pack.quality==='low'?4:6);
    expect(state.pack.downloadBytes).toBeLessThan(state.pack.quality==='low'?240000:1048576);
    const artTarget=page.locator('#reference');
    await artTarget.evaluate(img=>img.decode());
    expect(await artTarget.getAttribute('data-reference-id')).toBe('WORLD-GFX-FOG-FRONTIER-20260925');
    expect(await artTarget.evaluate(img=>img.naturalWidth)).toBe(280);
    await page.waitForFunction(()=>window.AI3DCinematicPack?.stats?.().frameSampleCount>=10,
      null,{timeout:10000});
    const telemetry=await page.evaluate(()=>window.AI3DCinematicPack.stats());
    expect(telemetry.frameIntervalP95Ms).toBeGreaterThan(0);
    expect(telemetry.fullSceneDrawCalls).toBeGreaterThan(0);
    expect(telemetry.fullSceneTriangles).toBeGreaterThan(0);
    expect(telemetry.gpuFrameTimeMeasured).toBe(false);
    expect(telemetry.instancedRockCount).toBeGreaterThanOrEqual(12);
    expect(telemetry.effects.spriteCount).toBeGreaterThanOrEqual(10);
    expect(telemetry.effects.lavaRibbonVertices).toBeGreaterThanOrEqual(300);
    expect(telemetry.effects.lavaPaths).toBeGreaterThanOrEqual(5);
    expect(telemetry.effects.spriteCount).toBeLessThanOrEqual(55);
    expect(telemetry.targetId).toBe('WORLD-GFX-FOG-FRONTIER-20260925');
    const button=page.locator('#cinematicEruption');
    await expect(button).toHaveCount(1);
    await button.click();
    const eruption=await page.evaluate(()=>window.AI3DCinematicPack.triggerEruption(performance.now()));
    expect(eruption.authoritativeGameEvent).toBe(false);
    expect((await page.evaluate(()=>window.AI3DCinematicPack.stats())).effects.eruptionActive).toBe(true);
    expect(errors).toEqual([]);
    await info.attach('cpu-cinematic-loaded-preview',{
      body:await page.screenshot({fullPage:false}),contentType:'image/png'
    });
  });
  test('unmodified default route does not fetch or mount cinematic assets',async({page})=>{
    test.setTimeout(45000);
    const assetRequests=[];
    page.on('request',req=>{
      if(req.url().includes('/cinematic-assets/'))assetRequests.push(req.url());
    });
    await page.goto('/apps/ai3d-voxel-city/');
    await page.waitForFunction(()=>window.AI3DVoxelRuntime?.stats?.().defaultCityLoaded===true,
      null,{timeout:30000});
    expect(assetRequests).toEqual([]);
    await expect(page.locator('#cinematicEruption')).toHaveCount(0);
    expect(await page.evaluate(()=>window.AI3DCinematicPack||null)).toBeNull();
  });
});
