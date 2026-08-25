const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const manifest=require('../data/visual-baselines.json');

const approved=manifest.approvedBaselines||[];
for(const b of approved){
  test(`perceptual-baseline ${b.id}`,async({page},testInfo)=>{
    const app=b.app||String(b.id).split(':')[0]||'catalog';
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    if(app!=='catalog')await page.waitForSelector('canvas',{state:'visible',timeout:20000});
    // Playwright's screenshot matcher checks rendered pixels after browser rendering.
    await expect(page).toHaveScreenshot(path.basename(b.path),{
      maxDiffPixelRatio:Number(b.maxDiffPixelRatio??.015),
      threshold:Number(b.threshold??.18),
      animations:'disabled',
      caret:'hide'
    });
  });
}
test('visual baseline registry is internally consistent',async()=>{
  for(const b of approved){
    expect(b.id).toBeTruthy();
    expect(b.path).toBeTruthy();
    expect(b.sha256).toMatch(/^[a-f0-9]{64}$/);
  }
});
