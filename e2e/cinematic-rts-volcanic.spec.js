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
      const meshes=[],meshNames=[],pbr=[];
      pack?.root?.traverse(o=>{
        if(o.name==='InstancedIndustrialPbrTiles'||o.name==='SculptedCrackedBasaltPbrTerrain')
          pbr.push({name:o.name,hasNormal:!!o.material.normalMap,
            hasRoughness:!!o.material.roughnessMap,hasMetalness:!!o.material.metalnessMap,
            hasAo:!!o.material.aoMap,uv2:!!o.geometry.attributes.uv2});
      });
      pack?.root?.traverse(o=>{
        if(o.isInstancedMesh)meshes.push({name:o.name,count:o.count,visible:o.visible});
        if(o.isMesh)meshNames.push(o.name);
      });
      return{
        error:window.__AI3D_CINEMATIC_CPU_ERROR__||null,
        worldLoaded:world?.defaultCityLoaded,voxels:world?.voxels,
        rts:pack?.stats?.().rts,
        oldBlockoutVisible:pack?.root?.getObjectByName('InstancedModularRTSIndustrialModules')?.visible,
        rtsVisible:pack?.root?.getObjectByName('RTSVolcanicTacticalStageVisualOnly')?.visible,
        fogDensity:pack?.root?.parent?.fog?.density,
        drawCalls:world?.renderer?.calls,triangles:world?.renderer?.triangles,
        cameraMinPitch:window.AI3D_RTS_CAMERA_MIN_PITCH,
        meshes,meshNames,pbr,
        canvas:!!document.querySelector('canvas')
      };
    });
    expect(capture.error).toBeNull();
    expect(capture.worldLoaded).toBe(true);
    expect(capture.voxels).toBeGreaterThan(30000);
    expect(capture.rts.visualOnly).toBe(true);
    expect(capture.rtsVisible).toBe(true);
    expect(await page.evaluate(()=>document.body.classList.contains('cinematic-rts-qa'))).toBe(true);
    const firstPersonHud=page.locator('#goldenMobileControls');
    if(await firstPersonHud.count())await expect(firstPersonHud).toBeHidden();
    // Regression: prior mobile sky fog of .0047 hid almost all tactical details.
    expect(capture.fogDensity).toBeGreaterThan(0);
    expect(capture.fogDensity).toBeLessThanOrEqual(.0014);
    expect(capture.drawCalls).toBeGreaterThan(25);
    expect(capture.triangles).toBeGreaterThan(1200);
    expect(capture.rts.authoritativeGameState).toBe(false);
    expect(capture.rts.collisionIntegrated).toBe(false);
    expect(capture.rts.tiles).toBeGreaterThan(100);
    expect(capture.rts.lavaTiles).toBeGreaterThan(20);
    expect(capture.rts.resourceCrystals).toBeGreaterThanOrEqual(12);
    expect(capture.rts.structures).toBe(6);
    expect(capture.rts.animatedScoutDrones).toBeGreaterThanOrEqual(9);
    expect(capture.rts.instanceDrawCallsUpperBound).toBeLessThanOrEqual(62);
    expect(capture.rts.hero.instanceCount).toBeGreaterThan(90);
    expect(capture.rts.terrainSculpt.realGeometricRelief).toBe(true);
    expect(capture.rts.terrainSculpt.cliffSegments).toBeGreaterThan(15);
    expect(capture.rts.terrainSculpt.sculptedTiles).toBeGreaterThan(100);
    expect(capture.rts.terrainSculpt.separateDrawCalls).toBe(1);
    expect(capture.rts.hero.drawBatches).toBeGreaterThanOrEqual(13);
    expect(capture.rts.hero.drawBatches).toBeLessThanOrEqual(27);
    expect(capture.rts.hero.buildingKinds).toEqual(expect.arrayContaining([
      'command','factory','refinery','relay','turret']));
    expect(capture.oldBlockoutVisible).toBe(false);
    expect(capture.rts.details.instances).toBeGreaterThan(170);
    expect(capture.rts.details.batches).toBeGreaterThanOrEqual(12);
    expect(capture.rts.terrainMaterialBytes).toBeLessThanOrEqual(1600000);
    expect(capture.pbr.length).toBe(2);
    for(const mat of capture.pbr){
      expect(mat.hasNormal).toBe(true);
      expect(mat.hasRoughness).toBe(true);
      expect(mat.hasMetalness).toBe(true);
      expect(mat.hasAo).toBe(true);
      expect(mat.uv2).toBe(true);
    }
    expect(capture.rts.detailWindows).toBeGreaterThanOrEqual(70);
    expect(capture.rts.roofFixtures).toBeGreaterThanOrEqual(12);
    expect(capture.cameraMinPitch).toBeGreaterThan(.62);
    expect(capture.meshes.some(x=>x.name==='InstancedBlueResourceCrystals'&&x.count>=12)).toBe(true);
    expect(capture.meshNames.includes('ProceduralCpuPaintedLavaRivers')).toBe(true);
    expect(capture.meshNames.includes('SculptedCrackedBasaltPbrTerrain')).toBe(true);
    expect(capture.meshNames.includes('InstancedWarmIndustrialWindows')).toBe(true);
    expect(capture.meshNames.some(name=>name.startsWith('RtsHero_hull'))).toBe(true);
    expect(capture.meshNames.includes('RtsHero_reactorCore')).toBe(true);
    expect(capture.meshNames.some(name=>name.startsWith('RtsHero_distiller'))).toBe(true);
    expect(capture.meshNames.includes('RtsHero_exhaustStack')).toBe(true);
    expect(capture.meshNames.some(name=>name.includes('turretBody'))).toBe(true);
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
