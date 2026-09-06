const {test,expect}=require('@playwright/test');
const {auditHud}=require('./helpers/hud-audit');
for(const app of ['catalog','voxel-world','ai3d-voxel-city']){
 test(`hud-audit ${app}`,async({page})=>{
  await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
  await expect(page.locator('#goldenToolbar')).toBeVisible();
  await expect(page.locator('#loading')).toBeHidden({timeout:10000});
  const report=await page.evaluate(auditHud);
  expect(report.issues).toEqual([]);
  expect(report.toolbarRatio).toBeLessThan(.08);
 });
}
test('HUD audit detects painted obstruction inside a transparent touch container',async({page})=>{
 await page.setContent('<div style="position:fixed;inset:0;pointer-events:none"><div id="obstruction" style="position:absolute;inset:0;background:black"></div></div>');
 expect((await page.evaluate(auditHud)).issues).toContainEqual(expect.objectContaining({id:'obstruction',type:'large-persistent-overlay'}));
 await page.locator('#obstruction').evaluate(el=>el.style.background='transparent');
 expect((await page.evaluate(auditHud)).issues).toEqual([]);
});
test('HUD audit respects scroll clipping but catches unclipped offscreen UI',async({page})=>{
 await page.setContent('<div id="clip" style="position:fixed;left:10px;top:10px;width:100px;height:30px;overflow:auto"><div id="wide" style="width:2000px;height:20px;background:black"></div></div>');
 expect((await page.evaluate(auditHud)).issues).toEqual([]);
 await page.locator('#clip').evaluate(el=>el.style.overflow='visible');
 expect((await page.evaluate(auditHud)).issues).toContainEqual(expect.objectContaining({id:'wide',type:'out-of-bounds'}));
});
