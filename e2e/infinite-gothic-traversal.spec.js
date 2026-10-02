const {test,expect}=require('@playwright/test');

async function ready(page){
  await page.goto('/apps/infinite-gothic-traversal/',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.InfiniteGothicTraversal?.stats?.().ready===true,null,{timeout:30000});
  await page.waitForFunction(()=>{
    const loader=document.querySelector('#loader');
    return !loader||loader.classList.contains('hidden');
  },null,{timeout:10000});
  await expect(page.locator('canvas')).toBeVisible();
  await expect(page.locator('#reticle')).toBeVisible();
}

test('infinite Gothic world streams a bounded connected route in all four directions',async({page})=>{
  const fatal=[];
  page.on('pageerror',e=>fatal.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')fatal.push(m.text());});
  await ready(page);

  const initial=await page.evaluate(()=>window.InfiniteGothicTraversal.stats());
  expect(initial.activeCells).toBe(25);
  expect(initial.activeEdges).toBe(40);
  expect(initial.renderedVoxels).toBeGreaterThan(5000);
  expect(initial.topology.walkable).toBe(true);
  expect(initial.viewport.canvasW/initial.viewport.w).toBeGreaterThan(.98);
  expect(initial.viewport.canvasH/initial.viewport.h).toBeGreaterThan(.98);

  const proof=await page.evaluate(()=>window.InfiniteGothicTraversal.proof(200));
  expect(proof.ok).toBe(true);
  expect(proof.failures).toEqual([]);

  const results={};
  for(const direction of ['east','west','north','south']){
    results[direction]=await page.evaluate(
      ({direction,cells})=>window.InfiniteGothicTraversal.testTravel(direction,cells),
      {direction,cells:6},
    );
    expect(results[direction].blockedSteps).toBe(0);
    expect(results[direction].walkable).toBe(true);
  }

  expect(results.east.cell.cx).toBeGreaterThanOrEqual(6);
  expect(results.west.cell.cx).toBeLessThanOrEqual(-6);
  expect(results.south.cell.cz).toBeGreaterThanOrEqual(6);
  expect(results.north.cell.cz).toBeLessThanOrEqual(-6);

  await page.waitForTimeout(1600);
  const final=await page.evaluate(()=>window.InfiniteGothicTraversal.stats());
  expect(final.activeCells).toBe(25);
  expect(final.activeEdges).toBe(40);
  expect(final.detailRadius).toBe(2);
  expect(final.visitedCells).toBeGreaterThanOrEqual(20);
  expect(final.renderedVoxels).toBeGreaterThan(5000);
  expect(final.fps).toBeGreaterThan(10);
  expect(fatal.filter(x=>!/favicon|404/i.test(x))).toEqual([]);
});

test('graphics-first presentation keeps the world fullscreen with only a reticle',async({page})=>{
  await ready(page);
  const layout=await page.evaluate(()=>({
    reticle:document.querySelector('#reticle').getBoundingClientRect().toJSON(),
    canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),
    persistent:[...document.body.children]
      .filter(el=>!['scene','reticle','a11y','loader'].includes(el.id)&&getComputedStyle(el).display!=='none')
      .map(el=>({id:el.id,tag:el.tagName})),
    w:innerWidth,h:innerHeight,
  }));
  expect(layout.persistent).toEqual([]);
  expect(layout.canvas.width/layout.w).toBeGreaterThan(.98);
  expect(layout.canvas.height/layout.h).toBeGreaterThan(.98);
  expect(layout.reticle.width*layout.reticle.height/(layout.w*layout.h)).toBeLessThan(.01);
});

test('mobile invisible touch zones move and turn without adding HUD controls',async({page,isMobile})=>{
  test.skip(!isMobile,'mobile project only');
  await ready(page);
  const before=await page.evaluate(()=>window.InfiniteGothicTraversal.stats());
  const canvas=page.locator('canvas');
  const box=await canvas.boundingBox();
  expect(box).toBeTruthy();

  await canvas.dispatchEvent('pointerdown',{
    pointerId:11,pointerType:'touch',isPrimary:true,
    clientX:box.x+box.width*.22,clientY:box.y+box.height*.72,
  });
  await canvas.dispatchEvent('pointermove',{
    pointerId:11,pointerType:'touch',isPrimary:true,
    clientX:box.x+box.width*.22,clientY:box.y+box.height*.55,
  });
  await page.waitForTimeout(700);
  await canvas.dispatchEvent('pointerup',{
    pointerId:11,pointerType:'touch',isPrimary:true,
    clientX:box.x+box.width*.22,clientY:box.y+box.height*.55,
  });

  const moved=await page.evaluate(()=>window.InfiniteGothicTraversal.stats());
  expect(Math.hypot(moved.player.x-before.player.x,moved.player.z-before.player.z)).toBeGreaterThan(.8);

  await canvas.dispatchEvent('pointerdown',{
    pointerId:12,pointerType:'touch',isPrimary:true,
    clientX:box.x+box.width*.78,clientY:box.y+box.height*.55,
  });
  await canvas.dispatchEvent('pointermove',{
    pointerId:12,pointerType:'touch',isPrimary:true,
    clientX:box.x+box.width*.68,clientY:box.y+box.height*.50,
  });
  await canvas.dispatchEvent('pointerup',{
    pointerId:12,pointerType:'touch',isPrimary:true,
    clientX:box.x+box.width*.68,clientY:box.y+box.height*.50,
  });

  const turned=await page.evaluate(()=>window.InfiniteGothicTraversal.stats());
  expect(Math.abs(turned.player.yaw-moved.player.yaw)).toBeGreaterThan(.05);
  const visibleTouchHud=await page.evaluate(()=>document.querySelectorAll('.joystick,.mobile-controls,.touch-pad').length);
  expect(visibleTouchHud).toBe(0);
});
