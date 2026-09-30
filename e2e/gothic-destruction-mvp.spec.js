const {test,expect}=require('@playwright/test');

async function ready(page){
  await page.goto('/apps/gothic-destruction-mvp/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.GothicDestructionMVP?.stats?.().ready===true,null,{timeout:30000});
  await page.waitForFunction(()=>{
    const loader=document.querySelector('#loader');
    return !loader||loader.classList.contains('hidden');
  },null,{timeout:10000});
  await expect(page.locator('#fire')).toBeVisible();
  await expect(page.locator('#reticle')).toBeVisible();
}

function spread(bodies){
  const sample=bodies.slice(0,16);
  let max=0;
  for(let i=0;i<sample.length;i++)for(let j=i+1;j<sample.length;j++){
    const a=sample[i].position,b=sample[j].position;
    max=Math.max(max,Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z));
  }
  return max;
}

async function fireAndProveSeparation(page,target){
  await page.evaluate(t=>window.GothicDestructionMVP.aim(t),target);
  const before=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  const beforeIds=new Set(before.fragments.bodies.map(b=>b.id));
  await page.locator('#fire').click();

  await page.waitForFunction(t=>{
    const s=window.GothicDestructionMVP?.stats?.();
    return s?.[t]?.fired===true&&s?.[t]?.fragments>=8&&!s?.busy;
  },target,{timeout:20000});

  const first=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  const created=first.fragments.bodies.filter(b=>!beforeIds.has(b.id));
  expect(created.length).toBeGreaterThanOrEqual(8);
  expect(new Set(created.map(b=>b.voxelKey)).size).toBe(created.length);
  const startSpread=spread(created);

  await page.waitForTimeout(900);
  const later=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  const ids=new Set(created.map(b=>b.id));
  const moved=later.fragments.bodies.filter(b=>ids.has(b.id));
  expect(moved.length).toBe(created.length);
  expect(spread(moved)).toBeGreaterThan(startSpread+.12);

  let independentlyMoved=0;
  for(const body of created){
    const after=moved.find(x=>x.id===body.id);
    if(after&&Math.hypot(after.position.x-body.position.x,after.position.y-body.position.y,after.position.z-body.position.z)>.06)independentlyMoved++;
  }
  expect(independentlyMoved).toBeGreaterThanOrEqual(Math.min(8,created.length));
  expect(later.physics.activeBodies).toBeLessThanOrEqual(later.quality.activeFragmentBudget);
  expect(later.physics.activeColliders).toBe(later.physics.activeBodies);
  expect(later.shots).toBe(before.shots+1);
}

test('public Gothic MVP shatters tower and viaduct into independent voxel rigid bodies',async({page})=>{
  const fatal=[];
  page.on('pageerror',e=>fatal.push(String(e)));
  page.on('console',m=>{if(m.type()==='error'&&/GOTHIC MVP|Rapier|TypeError|RangeError/i.test(m.text()))fatal.push(m.text());});

  await ready(page);
  const initial=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  expect(initial.tower.voxels).toBeGreaterThan(200);
  expect(initial.viaduct.voxels).toBeGreaterThan(200);
  expect(initial.rapier.version).toBe('0.21.0');
  expect(initial.quality.perShotFragmentBudget).toBeGreaterThanOrEqual(48);
  expect(initial.quality.activeFragmentBudget).toBeGreaterThanOrEqual(initial.quality.perShotFragmentBudget*2);
  expect((initial.viewport.canvas.w*initial.viewport.canvas.h)/(initial.viewport.w*initial.viewport.h)).toBeGreaterThan(.98);

  await fireAndProveSeparation(page,'tower');
  await fireAndProveSeparation(page,'viaduct');

  const final=await page.evaluate(()=>window.GothicDestructionMVP.stats());
  expect(final.tower.fired).toBe(true);
  expect(final.viaduct.fired).toBe(true);
  expect(final.shots).toBe(2);
  expect(final.fragments.count).toBeGreaterThanOrEqual(16);
  expect(final.fps).toBeGreaterThan(10);
  expect(fatal).toEqual([]);
});

test('graphics-first HUD exposes only reticle and fire button',async({page})=>{
  await ready(page);
  const layout=await page.evaluate(()=>({
    hud:window.GothicDestructionMVP.stats().hud.visible,
    fire:document.querySelector('#fire').getBoundingClientRect().toJSON(),
    reticle:document.querySelector('#reticle').getBoundingClientRect().toJSON(),
    canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),
    forbidden:['#top','#panel','#legend','#status','.target','.secondary'].filter(sel=>document.querySelector(sel)),
    w:innerWidth,h:innerHeight,
  }));
  expect(layout.hud.sort()).toEqual(['fire','reticle']);
  expect(layout.forbidden).toEqual([]);
  expect(layout.fire.width*layout.fire.height/(layout.w*layout.h)).toBeLessThan(.08);
  expect(layout.reticle.width*layout.reticle.height/(layout.w*layout.h)).toBeLessThan(.01);
  expect(layout.canvas.width/layout.w).toBeGreaterThan(.98);
  expect(layout.canvas.height/layout.h).toBeGreaterThan(.98);
});
