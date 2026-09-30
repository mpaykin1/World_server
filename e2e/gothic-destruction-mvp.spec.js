const {test,expect}=require('@playwright/test');

async function ready(page){
  await page.goto('/apps/gothic-destruction-mvp/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.GothicDestructionMVP?.stats?.().ready===true,null,{timeout:30000});
  await expect(page.locator('#loader')).toHaveClass(/hidden/);
  await expect(page.locator('#fire')).toBeVisible();
}

async function fireAndProveMotion(page,target){
  await page.locator(`.target[data-target="${target}"]`).click();
  const before=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  await page.locator('#fire').click();
  await page.waitForFunction(t=>{
    const s=window.GothicDestructionMVP?.stats?.();
    return s?.[t]?.fired===true&&s?.[t]?.dynamic>0&&s?.physics?.bodies?.length>0;
  },target,{timeout:15000});
  const first=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  const body=first.physics.bodies.at(-1);
  expect(body).toBeTruthy();
  await page.waitForTimeout(700);
  const later=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  const moved=later.physics.bodies.find(b=>b.id===body.id);
  expect(moved).toBeTruthy();
  expect(Math.hypot(moved.position.x-body.position.x,moved.position.y-body.position.y,moved.position.z-body.position.z)).toBeGreaterThan(.01);
  expect(later.physics.activeBodies).toBeLessThanOrEqual(12);
  expect(later.physics.activeColliders).toBeLessThanOrEqual(1800);
  expect(later.shots).toBe(before.shots+1);
}

test('public Gothic Destruction MVP shows and physically destroys tower plus viaduct',async({page})=>{
  const fatal=[];
  page.on('pageerror',e=>fatal.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/GOTHIC MVP|Rapier|TypeError|RangeError/i.test(m.text()))fatal.push(m.text());});
  await ready(page);
  const initial=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  expect(initial.tower.voxels).toBeGreaterThan(200);
  expect(initial.viaduct.voxels).toBeGreaterThan(200);
  expect(initial.rapier.version).toBe('0.21.0');
  expect((initial.viewport.canvas.w*initial.viewport.canvas.h)/(initial.viewport.w*initial.viewport.h)).toBeGreaterThan(.92);

  await fireAndProveMotion(page,'tower');
  await fireAndProveMotion(page,'viaduct');

  const final=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  expect(final.tower.fired).toBe(true);
  expect(final.viaduct.fired).toBe(true);
  expect(final.shots).toBe(2);
  expect(final.fps).toBeGreaterThan(10);
  expect(fatal).toEqual([]);
});

test('mobile controls stay visible without hiding the 3D canvas',async({page,isMobile})=>{
  test.skip(!isMobile,'mobile project only');
  await ready(page);
  const layout=await page.evaluate(()=>({
    fire:document.querySelector('#fire').getBoundingClientRect().toJSON(),
    panel:document.querySelector('#panel').getBoundingClientRect().toJSON(),
    canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),
    w:innerWidth,h:innerHeight,
  }));
  expect(layout.fire.width).toBeGreaterThan(180);
  expect(layout.panel.right).toBeLessThanOrEqual(layout.w+2);
  expect(layout.panel.bottom).toBeLessThanOrEqual(layout.h+2);
  expect(layout.canvas.width/layout.w).toBeGreaterThan(.98);
  expect(layout.canvas.height/layout.h).toBeGreaterThan(.98);
});
