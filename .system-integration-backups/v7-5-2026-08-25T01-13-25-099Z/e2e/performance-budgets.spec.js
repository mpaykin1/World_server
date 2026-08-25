const {test,expect}=require('@playwright/test');
const budgets=require('../data/performance-budgets.json').budgets;
for(const [app,b] of Object.entries(budgets)){
  test(`performance-budget ${app}`,async({page})=>{
    const started=Date.now();
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    const nav=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.toJSON?.()||{});
    if(Number(nav.domContentLoadedEventEnd))expect(nav.domContentLoadedEventEnd).toBeLessThanOrEqual(b.domContentLoadedMs);
    if(app!=='catalog'){
      await page.waitForSelector('canvas',{state:'visible',timeout:b.canvasVisibleMs});
      expect(Date.now()-started).toBeLessThanOrEqual(b.canvasVisibleMs+2500);
    }
    const heap=await page.evaluate(()=>performance.memory?.usedJSHeapSize||null);
    if(heap!=null)expect(heap/1024/1024).toBeLessThanOrEqual(512);
  });
}
