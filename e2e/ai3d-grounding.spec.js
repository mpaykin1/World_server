const {test,expect}=require('@playwright/test');
for(const [app,runtime] of [['ai3d-voxel-city','AI3DVoxelRuntime'],['voxel-world','VoxelWorldRuntime']]){
test(`${app} grounded spawn is outside solids and within 6cm of its actual floor`,async({page})=>{
 await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(name=>window[name]?.stats().player.onGround,runtime);
 await page.waitForTimeout(300);
 const proof=await page.evaluate(name=>{
  const r=window[name],p=r.stats().player;
  return {grounded:p.onGround,inside:r.collidesAt(p.x,p.y,p.z),floor:r.collidesAt(p.x,p.y-.06,p.z),y:p.y};
 },runtime);
 expect(proof.grounded).toBe(true);expect(proof.inside).toBe(false);expect(proof.floor).toBe(true);
 const first=proof.y;await page.waitForTimeout(500);
 expect(Math.abs(await page.evaluate(name=>window[name].stats().player.y,runtime)-first)).toBeLessThan(.02);
});
}
