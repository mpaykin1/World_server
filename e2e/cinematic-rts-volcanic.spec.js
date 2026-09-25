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
        rtsBackdrop:pack?.stats?.().rtsBackdrop,
        camera:window.AI3DCinematicCamera||null,
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
    expect(capture.rts.bakedLighting.dynamicShadowMaps).toBe(0);
    expect(capture.rts.bakedLighting.realtimePointLights).toBe(0);
    expect(capture.rts.bakedLighting.contactShadows).toBe(6);
    expect(capture.rts.bakedLighting.lavaBankGlows).toBeGreaterThan(5);
    expect(capture.rts.bakedLighting.crystalHalos).toBeGreaterThanOrEqual(12);
    expect(capture.rts.bakedLighting.drawBatches).toBe(3);
    expect(capture.rtsBackdrop).toBeNull(); // skyline must NOT obscure RTS play
    expect(capture.camera.horizonClearanceDeg).toBeGreaterThanOrEqual(14);
    expect(capture.camera.minimumPitch).toBeGreaterThan(.6);
    expect(capture.rtsVisible).toBe(true);
    expect(await page.evaluate(()=>document.body.classList.contains('cinematic-rts-qa'))).toBe(true);
    const firstPersonHud=page.locator('#goldenMobileControls');
    if(await firstPersonHud.count())await expect(firstPersonHud).toBeHidden();
    // Regression: prior mobile sky fog of .0047 hid almost all tactical details.
    expect(capture.fogDensity).toBeGreaterThan(0);
    expect(capture.fogDensity).toBeLessThanOrEqual(.0014);
    // Fewer actual draw calls are an optimization, not a rendering failure.
    // Verify rendered triangles and cap overdraw instead of demanding >25 calls.
    expect(capture.drawCalls).toBeGreaterThan(0);
    expect(capture.drawCalls).toBeLessThanOrEqual(120);
    expect(capture.triangles).toBeGreaterThan(1200);
    expect(capture.rts.authoritativeGameState).toBe(false);
    expect(capture.rts.collisionIntegrated).toBe(false);
    expect(capture.rts.tiles).toBeGreaterThan(100);
    expect(capture.rts.lavaTiles).toBeGreaterThan(20);
    expect(capture.rts.lavaChannels.lavaPatches).toBe(capture.rts.lavaTiles);
    expect(capture.rts.lavaChannels.drawBatches).toBe(1);
    expect(capture.rts.lavaChannels.seamFreeWorldUV).toBe(true);
    expect(capture.rts.outerAsh.triangles).toBeGreaterThan(500);
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
    expect(capture.meshNames.includes('OuterAshBasaltStage')).toBe(true);
    expect(capture.meshNames.includes('RtsBaked_contact')).toBe(true);
    expect(capture.meshNames.includes('RtsBaked_lava')).toBe(true);
    expect(capture.meshNames.includes('RtsBaked_mineral')).toBe(true);
    expect(capture.meshNames.includes('SculptedCrackedBasaltPbrTerrain')).toBe(true);
    expect(capture.meshNames.includes('InstancedWarmIndustrialWindows')).toBe(true);
    expect(capture.meshNames.some(name=>name.startsWith('RtsHero_hull'))).toBe(true);
    expect(capture.meshNames.includes('RtsHero_reactorCore')).toBe(true);
    expect(capture.meshNames.some(name=>name.startsWith('RtsHero_distiller'))).toBe(true);
    expect(capture.meshNames.includes('RtsHero_exhaustStack')).toBe(true);
    expect(capture.meshNames.some(name=>name.includes('turretBody'))).toBe(true);
    expect(capture.canvas).toBe(true);
    expect(errors).toEqual([]);
    // Synthetic multitouch verifies the real canvas listener path in mobile
    // Chromium; only a physical phone can certify actual gesture ergonomics.
    if(info.project.name.includes('mobile')){
      const touch=await page.evaluate(()=>{
        const canvas=document.querySelector('#viewer canvas');
        const ctrl=window.AI3D_RTSPinch;
        const before=ctrl.stats();
        const finger=(id,x)=>new Touch({
          identifier:id,target:canvas,clientX:x,clientY:100});
        const start=[finger(1,80),finger(2,280)];
        const closer=[finger(1,80),finger(2,180)];
        canvas.dispatchEvent(new TouchEvent('touchstart',{
          touches:start,targetTouches:start,changedTouches:start,
          bubbles:true,cancelable:true}));
        canvas.dispatchEvent(new TouchEvent('touchmove',{
          touches:closer,targetTouches:closer,changedTouches:closer,
          bubbles:true,cancelable:true}));
        const after=ctrl.stats();
        canvas.dispatchEvent(new TouchEvent('touchend',{
          touches:[],targetTouches:[],changedTouches:closer,
          bubbles:true,cancelable:true}));
        return{before,after,touchAction:canvas.style.touchAction};
      });
      expect(touch.after.zoomEvents).toBeGreaterThan(touch.before.zoomEvents);
      expect(touch.touchAction).toBe('none');
    }
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
  test('optional CPU industrial skyline is bounded and never required by RTS',async({page})=>{
    test.setTimeout(65000);
    await page.goto('/apps/ai3d-voxel-city/?cinematicCpu=1&rtsVolcanic=1&rtsBackdrop=1');
    await page.waitForFunction(()=>window.AI3DCinematicPack?.stats?.().rtsBackdrop,
      null,{timeout:55000});
    const stats=await page.evaluate(()=>window.AI3DCinematicPack.stats());
    expect(stats.rtsBackdrop.layerCount).toBeGreaterThanOrEqual(2);
    expect(stats.rtsBackdrop.layerCount).toBeLessThanOrEqual(3);
    expect(stats.rtsBackdrop.paintedWindows).toBeGreaterThan(35);
    expect(stats.rtsBackdrop.pixelBytes).toBeLessThan(4_000_000);
    expect(stats.rts.visualOnly).toBe(true);
    expect(stats.collisionIntegrated).toBe(false);
  });
});
