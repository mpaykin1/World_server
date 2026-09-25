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
    expect(await page.evaluate(()=>window.AI3DCinematicPack||null)).toBeNull();
  });
});
