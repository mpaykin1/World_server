const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
for(const app of ['catalog','voxel-world','ai3d-voxel-city']){
  test(`visual-candidate ${app}`,async({page},testInfo)=>{
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    if(app!=='catalog')await page.waitForSelector('canvas',{state:'visible',timeout:20000});
    const dir=path.join(process.cwd(),'visual-candidates',testInfo.project.name);
    fs.mkdirSync(dir,{recursive:true});
    await page.screenshot({path:path.join(dir,`${app}.png`),fullPage:false});
  });
}
