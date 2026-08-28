const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const OUT=path.resolve('artifacts/cinematic');
fs.mkdirSync(OUT,{recursive:true});
const cases=[
  {name:'desktop',viewport:{width:1280,height:720},mobile:false},
  {name:'mobile',viewport:{width:390,height:844},mobile:true}
];
for(const c of cases){
  test(`cinematic voxel capture ${c.name}`,async({browser})=>{
    const context=await browser.newContext({viewport:c.viewport,isMobile:c.mobile,deviceScaleFactor:1});
    const page=await context.newPage();
    await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});
    await expect(page.locator('canvas')).toBeVisible({timeout:20000});
    await page.waitForTimeout(3500);
    const guard=await page.evaluate(()=>({
      present:!!window.CinematicVoxelQualityGuard,
      autopilot:!!window.WorldQualityAutopilot,
      perf:!!window.GoldenPerformanceAutoTune,
      state:window.WorldQualityAutopilot?.getState?.()||[],
      cinematic:window.CinematicVoxelQualityGuard?.auditAll?.({repair:false})||null
    }));
    expect(guard.present).toBeTruthy();
    expect(guard.autopilot).toBeTruthy();
    expect(guard.perf).toBeTruthy();
    fs.writeFileSync(path.join(OUT,`runtime-${c.name}.json`),JSON.stringify(guard,null,2));
    await page.screenshot({path:path.join(OUT,`voxel-world-${c.name}.png`),fullPage:false});
    await context.close();
  });
}
