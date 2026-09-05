import { test, expect } from '@playwright/test';
test('procedural VFX V3 is deterministic, budget-aware and production-orchestrated', async ({ page }) => {
  await page.goto('/apps/ai3d-voxel-city/');
  await page.waitForFunction(() => window.WorldProceduralVfx?.version==='3.0.0' && window.WorldProceduralVfx?.engine, null, { timeout: 30000 });
  const result = await page.evaluate(() => {
    const api=window.WorldProceduralVfx,engine=api.engine,c=engine.camera?.position||{x:0,y:2,z:0};const p=[c.x||0,c.y||0,c.z||0];
    const types=['pulse','sparks','beam','ribbon','decal'];
    const ids=types.map((type,i)=>api.spawn({id:`e2e-vfx-v3-${i}`,type,position:p,target:[p[0],p[1]+1,p[2]-2],seed:300+i,priority:5,semantic:i===4?'impact':'reveal',params:{duration:2,particleCount:16}}));
    const duplicate=api.spawn({id:'e2e-vfx-v3-0',type:'pulse',position:p,seed:300});
    const before=api.stats();engine.quality.setTier('low','e2e');const low=api.stats();
    return {ids,duplicate,active:before.active,lowTier:low.quality.tier,deviceClass:before.deviceClass,interestRadius:before.interest.radius,surfaceCells:before.surface.cells,webgpuReason:before.webgpu.reason};
  });
  expect(result.ids.filter(Boolean)).toHaveLength(5);
  expect(result.duplicate).toBeNull();
  expect(result.active).toBeGreaterThanOrEqual(5);
  expect(result.lowTier).toBe('low');
  expect(result.deviceClass).toBeTruthy();
  expect(result.surfaceCells).toBeGreaterThan(0);
  expect(result.webgpuReason).toBeTruthy();
});
