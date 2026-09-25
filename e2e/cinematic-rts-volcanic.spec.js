'use strict';
const {test,expect}=require('@playwright/test');

test.describe('RTS volcano / existing cinematic renderer integration',()=>{
  test('real loaded 3D map has lava, blue resources, buildings and scout units',async({page},info)=>{
    test.setTimeout(75000);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto('/apps/ai3d-voxel-city/?cinematicCpu=1&rtsVolcanic=1');
    await page.waitForFunction(()=>window.AI3DCinematicPack?.status||
      window.__AI3D_CINEMATIC_CPU_ERROR__,null,{timeout:55000});
    await page.waitForTimeout(600);
    const capture=await page.evaluate(()=>{
      const pack=window.AI3DCinematicPack,world=window.AI3DVoxelRuntime?.stats?.();
      const meshes=[],meshNames=[];
      pack?.root?.traverse(o=>{
        if(o.isInstancedMesh)meshes.push({name:o.name,count:o.count,visible:o.visible});
        if(o.isMesh)meshNames.push(o.name);
      });
      return{
        error:window.__AI3D_CINEMATIC_CPU_ERROR__||null,
        worldLoaded:world?.defaultCityLoaded,voxels:world?.voxels,
        rts:pack?.stats?.().rts,
        cameraMinPitch:window.AI3D_RTS_CAMERA_MIN_PITCH,
        meshes,meshNames,
        canvas:!!document.querySelector('canvas')
      };
    });
    expect(capture.error).toBeNull();
    expect(capture.worldLoaded).toBe(true);
    expect(capture.voxels).toBeGreaterThan(30000);
    expect(capture.rts.visualOnly).toBe(true);
    expect(capture.rts.authoritativeGameState).toBe(false);
    expect(capture.rts.collisionIntegrated).toBe(false);
    expect(capture.rts.tiles).toBeGreaterThan(100);
    expect(capture.rts.lavaTiles).toBeGreaterThan(20);
    expect(capture.rts.resourceCrystals).toBeGreaterThanOrEqual(12);
    expect(capture.rts.structures).toBe(6);
    expect(capture.rts.animatedScoutDrones).toBeGreaterThanOrEqual(9);
    expect(capture.rts.instanceDrawCallsUpperBound).toBeLessThanOrEqual(13);
    expect(capture.rts.detailWindows).toBeGreaterThanOrEqual(70);
    expect(capture.rts.roofFixtures).toBeGreaterThanOrEqual(12);
    expect(capture.cameraMinPitch).toBeGreaterThan(.62);
    expect(capture.meshes.some(x=>x.name==='InstancedBlueResourceCrystals'&&x.count>=12)).toBe(true);
    expect(capture.meshNames.includes('ProceduralCpuPaintedLavaRivers')).toBe(true);
    expect(capture.meshNames.includes('InstancedWarmIndustrialWindows')).toBe(true);
    expect(capture.canvas).toBe(true);
    expect(errors).toEqual([]);
    await info.attach('real-volcanic-rts-map',{
      body:await page.screenshot({fullPage:false}),contentType:'image/png'});
  });
  test('unchanged default city does not mount tactical map or fetch cinematic GLBs',async({page})=>{
    test.setTimeout(45000);
    const assets=[];page.on('request',req=>{
      if(req.url().includes('/cinematic-assets/'))assets.push(req.url());
    });
    await page.goto('/apps/ai3d-voxel-city/');
    await page.waitForFunction(()=>window.AI3DVoxelRuntime?.stats?.().defaultCityLoaded===true,
      null,{timeout:30000});
    expect(await page.evaluate(()=>window.AI3DCinematicPack?.stats?.().rts||null)).toBeNull();
    expect(assets).toEqual([]);
    expect(await page.evaluate(()=>window.AI3D_RTS_CAMERA_MIN_PITCH||null)).toBeNull();
  });
});
