const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const OUT=path.resolve('artifacts/cinematic/device-matrix');fs.mkdirSync(OUT,{recursive:true});
const profiles=[
 {name:'phone-low',viewport:{width:360,height:740},mobile:true,cores:4,memory:4,minFps:25},
 {name:'phone-mid',viewport:{width:390,height:844},mobile:true,cores:8,memory:6,minFps:30},
 {name:'desktop-igpu',viewport:{width:1280,height:720},mobile:false,cores:4,memory:8,minFps:35},
 {name:'desktop-high',viewport:{width:1920,height:1080},mobile:false,cores:8,memory:16,minFps:45}
];
for(const p of profiles)test(`cinematic device matrix ${p.name}`,async({browser})=>{
 const context=await browser.newContext({viewport:p.viewport,isMobile:p.mobile,deviceScaleFactor:1});
 const page=await context.newPage();
 await page.addInitScript(({cores,memory})=>{Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>cores});Object.defineProperty(navigator,'deviceMemory',{get:()=>memory});},{cores:p.cores,memory:p.memory});
 await page.goto('/apps/voxel-world/',{waitUntil:'domcontentloaded'});await expect(page.locator('canvas')).toBeVisible({timeout:20000});await page.waitForTimeout(5000);
 const s=await page.evaluate(()=>({autopilot:window.WorldQualityAutopilot?.getState?.()||[],temporal:window.CinematicTemporalQualityGovernor?.getState?.()||null,guard:window.CinematicVoxelQualityGuard?.auditAll?.({repair:false})||null}));
 fs.writeFileSync(path.join(OUT,`${p.name}.json`),JSON.stringify(s,null,2));await page.screenshot({path:path.join(OUT,`${p.name}.png`)});
 expect(s.autopilot).toBeTruthy();
 await context.close();
});
