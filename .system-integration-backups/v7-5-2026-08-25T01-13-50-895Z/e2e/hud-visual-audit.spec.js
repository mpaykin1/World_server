const {test,expect}=require('@playwright/test');
const apps=['catalog','voxel-world','ai3d-voxel-city'];
for(const app of apps){
  test(`hud-audit ${app}`,async({page})=>{
    await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
    const report=await page.evaluate(()=>{
      const vp=innerWidth*innerHeight,issues=[],persistent=[];
      for(const el of document.querySelectorAll('body *')){
        const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden'||Number(cs.opacity)===0)continue;
        if(cs.position!=='fixed'&&cs.position!=='sticky')continue;
        if(el.closest('#goldenDrawer'))continue;
        const r=el.getBoundingClientRect();if(r.width<=0||r.height<=0)continue;
        const area=r.width*r.height;const ratio=area/Math.max(1,vp);
        if(r.left<-.5||r.top<-.5||r.right>innerWidth+.5||r.bottom>innerHeight+.5)issues.push({type:'out-of-bounds',id:el.id||el.className});
        if(ratio>.08&&!el.matches('#mobileControls,#goldenUiShell'))issues.push({type:'large-persistent-overlay',id:el.id||el.className,ratio});
        persistent.push({id:el.id||el.className,ratio});
      }
      const toolbar=document.querySelector('#goldenToolbar');
      const ratio=toolbar?(()=>{const r=toolbar.getBoundingClientRect();return r.width*r.height/Math.max(1,vp)})():0;
      return {issues,persistent,toolbarRatio:ratio};
    });
    expect(report.issues).toEqual([]);
    expect(report.toolbarRatio).toBeLessThan(.08);
  });
}
