const { test, expect } = require('@playwright/test');

async function waitForLab(page){
  await page.goto('/apps/voxel-world/?gothicDestruction=1',{waitUntil:'domcontentloaded'});
  await expect(page.locator('#gothicFireBtn')).toBeVisible({timeout:30000});
  await page.waitForFunction(()=>{
    const s=window.VoxelWorldRuntime?.stats?.().gothicDestruction;
    return s?.enabled===true&&s?.towerVoxels>100;
  },null,{timeout:30000});
}

for(const profile of ['desktop','mobile']){
  test(`gothic destruction ${profile}: cannon produces moving bounded rigid-body clusters`,async({page})=>{
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await waitForLab(page);

    const viewport=await page.evaluate(()=>({
      w:innerWidth,h:innerHeight,
      canvas:document.querySelector('canvas')?.getBoundingClientRect().toJSON?.()||null,
      button:document.querySelector('#gothicFireBtn')?.getBoundingClientRect().toJSON?.()||null,
      before:window.VoxelWorldRuntime.stats().gothicDestruction,
    }));
    expect(viewport.canvas).toBeTruthy();
    expect((viewport.canvas.width*viewport.canvas.height)/(viewport.w*viewport.h)).toBeGreaterThan(.85);
    expect(viewport.before.dynamicMeshes).toBe(0);
    expect(viewport.before.activeBodies).toBe(0);
    expect(viewport.before.rapier.version).toBe('0.21.0');

    await page.locator('#gothicFireBtn').click();
    await page.waitForFunction(()=>{
      const s=window.VoxelWorldRuntime?.stats?.().gothicDestruction;
      return s?.fired===true&&s?.dynamicMeshes>0&&s?.bodies?.length>0;
    },null,{timeout:15000});
    const first=await page.evaluate(()=>window.VoxelWorldRuntime.stats().gothicDestruction);
    expect(first.activeBodies).toBeGreaterThan(0);
    expect(first.activeBodies).toBeLessThanOrEqual(8);
    expect(first.activeColliders).toBeLessThanOrEqual(1400);
    const p0=first.bodies[0].position;

    await page.waitForTimeout(650);
    const later=await page.evaluate(()=>window.VoxelWorldRuntime.stats().gothicDestruction);
    const p1=later.bodies.find(b=>b.id===first.bodies[0].id)?.position;
    expect(p1).toBeTruthy();
    expect(Math.hypot(p1.x-p0.x,p1.y-p0.y,p1.z-p0.z)).toBeGreaterThan(.01);
    expect(errors.filter(e=>!/favicon|Failed to load resource.*404/i.test(e))).toEqual([]);
  });
}
