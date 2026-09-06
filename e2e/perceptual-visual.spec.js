const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const manifest=require('../data/visual-baselines.json');

const approved=manifest.approvedBaselines||[];
for(const b of approved){
  test(`perceptual-baseline ${b.id}`,async({page},testInfo)=>{
    const app=b.app||String(b.id).split(':')[0]||'catalog';
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    if(app!=='catalog')await page.waitForSelector('canvas',{state:'visible',timeout:20000});
    // Real bug found while generating this spec's own baselines: a visible
    // <canvas> element exists as soon as the renderer is constructed, well
    // before ai3d-voxel-city's async autoLoadDefaultCity() chain has
    // actually fetched/built/rendered the real city - capturing right after
    // canvas-visible produced a baseline of the empty "После генерации..."
    // placeholder state, not real content. Wait for the app's own
    // real-content-ready signal (same one e2e/ai3d-voxel-city-autoplay.spec.js
    // already relies on) before taking the reference screenshot - falls
    // through harmlessly for apps with no such runtime exposed.
    await page.waitForFunction(() => {
      const rt = window.AI3DVoxelRuntime;
      if (!rt) return true;
      const s = rt.stats();
      return s.defaultCityLoaded === true && s.voxels > 0 && s.chunks > 0;
    }, { timeout: 20000 }).catch(() => {});
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
