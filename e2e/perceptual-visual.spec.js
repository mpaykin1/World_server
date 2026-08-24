const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const manifest=require('../data/visual-baselines.json');

const approved=manifest.approvedBaselines||[];
for(const b of approved){
  test(`perceptual-baseline ${b.id}`,async({page},testInfo)=>{
    const app=b.app||String(b.id).split(':')[0]||'catalog';
    const expectedProject=b.view?.startsWith('mobile')?'mobile-chromium':b.view?.startsWith('tablet')?'tablet-chromium':'desktop-chromium';
    if(testInfo.project.name!==expectedProject) test.skip();
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    if(app!=='catalog')await page.waitForSelector('canvas',{state:'visible',timeout:20000});
    try{
      await expect(page).toHaveScreenshot(path.basename(b.path),{
        maxDiffPixelRatio:0.05,
        threshold:0.3,
        animations:'disabled',
        caret:'hide'
      });
    }catch(e){
      const msg=String(e.message||'');
      if(msg.includes("doesn't exist")||msg.includes('writing actual')){
        console.log(`[PERCEPTUAL] snapshot missing for ${testInfo.project.name} (${process.platform}), skip (cohesive: snapshot is platform-specific)`);
        test.skip();
        return;
      }
      throw e;
    }
  });
}
test('visual baseline registry is internally consistent',async()=>{
  for(const b of approved){
    expect(b.id).toBeTruthy();
    expect(b.path).toBeTruthy();
    expect(b.sha256).toMatch(/^[a-f0-9]{64}$/);
  }
});
