const {test,expect}=require('@playwright/test');

async function lab(page){
  await page.goto('/apps/trinity-lab/');
  await page.waitForFunction(()=>window.__trinityLab?.snapshot);
  await page.waitForTimeout(900);
  return page.evaluate(()=>window.__trinityLab.snapshot());
}
test('one recipe drives KRIEGER INK and CUBE with locked viewport',async({page})=>{
  let snap=await lab(page);
  expect(snap.mode).toBe('KRIEGER');expect(snap.visibility).toBeGreaterThanOrEqual(85);
  expect(snap.viewport.scrollX).toBe(0);expect(snap.viewport.scrollY).toBe(0);expect(snap.viewport.consistent).toBeTruthy();
  for(const gate of ['DEPTH_GATE','NEAR_OBJECT_GATE','MATERIAL_GATE','LIGHTING_GATE','ENVIRONMENT_GATE','ARCHITECTURAL_RHYTHM_GATE','MICRODETAIL_GATE','HERO_FOREGROUND_GATE','CONTROLLED_DARKNESS_GATE','MATERIAL_LIGHT_COUPLING_GATE'])expect(snap.gates[gate],gate).toBeTruthy();
  expect(snap.metrics.drawCalls).toBeLessThanOrEqual(180);expect(snap.metrics.triangles).toBeLessThan(700000);
  const seed=snap.seed,signature=snap.signature;
  await page.getByRole('button',{name:'INK',exact:true}).click();await page.waitForTimeout(600);
  await page.evaluate(()=>window.__trinityLab.moveCamera(.3,.2));await page.waitForTimeout(600);
  snap=await page.evaluate(()=>window.__trinityLab.snapshot());
  expect(snap.mode).toBe('INK');expect(snap.seed).toBe(seed);expect(snap.signature).toBe(signature);
  expect(snap.gates.SEMANTIC_INK_GATE).toBe('PASS');expect(snap.gates.STYLE_PERSISTENCE_GATE).toBe('PASS');
  await page.getByRole('button',{name:'CUBE',exact:true}).click();
  let cube=await page.evaluate(()=>window.__trinityLab.restartCube());
  expect(cube.physicalObjects).toBe(1);expect(cube.semanticIds).toEqual([]);
  cube=await page.evaluate(()=>window.__trinityLab.setCubeProgress(.46));
  expect(cube.physicalObjects).toBeGreaterThan(1);expect(cube.stages.terrain).toBeGreaterThan(0);
  cube=await page.evaluate(()=>window.__trinityLab.setCubeProgress(1));
  const target=await page.evaluate(()=>window.__trinityLab.targetIds);
  expect(cube.semanticIds).toEqual(target);
  snap=await page.evaluate(()=>window.__trinityLab.snapshot());
  expect(snap.gates.FINAL_SEMANTIC_EQUIVALENCE_GATE).toBe('PASS');
});
test('touch gestures never scroll the gameplay document',async({page})=>{
  await page.setViewportSize({width:390,height:844});await lab(page);
  await page.mouse.move(320,500);await page.mouse.down();await page.mouse.move(350,430,{steps:6});await page.mouse.up();
  await page.mouse.move(70,540);await page.mouse.down();await page.mouse.move(105,470,{steps:6});await page.mouse.up();
  const state=await page.evaluate(()=>({x:scrollX,y:scrollY,s:window.__trinityLab.snapshot()}));
  expect(state.x).toBe(0);expect(state.y).toBe(0);expect(state.s.viewport.consistent).toBeTruthy();
});
test('repeated mode switching stays alive',async({page})=>{
  await lab(page);for(const mode of ['INK','CUBE','KRIEGER','INK','CUBE','KRIEGER'])await page.evaluate(m=>window.__trinityLab.setMode(m),mode);
  await page.waitForTimeout(500);const snap=await page.evaluate(()=>window.__trinityLab.snapshot());
  expect(snap.mode).toBe('KRIEGER');expect(snap.metrics.triangles).toBeGreaterThan(0);
});
