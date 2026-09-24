const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const {execFileSync}=require('child_process');
const {captureLoadedGraphicsEvidence}=require('./helpers/loaded-graphics-evidence');
const checkoutSha=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
for(const app of ['catalog','voxel-world','ai3d-voxel-city']){
  test(`visual-candidate ${app}`,async({page},testInfo)=>{
    test.setTimeout(60000);
    const dir=path.join(process.cwd(),'visual-candidates',testInfo.project.name,`retry-${testInfo.retry}`);
    fs.mkdirSync(dir,{recursive:true});
    const evidence={app,project:testInfo.project.name,retry:testInfo.retry,checkoutSha,eventSha:process.env.GITHUB_SHA||null,
      runId:process.env.GITHUB_RUN_ID||null,attempt:process.env.GITHUB_RUN_ATTEMPT||null,
      pageErrors:[],consoleErrors:[],status:'INCOMPLETE'};
    page.on('pageerror',e=>evidence.pageErrors.push(String(e.message)));
    page.on('console',m=>{if(m.type()==='error')evidence.consoleErrors.push(m.text());});
    try{
      await page.goto(`/apps/${app}/`,{waitUntil:'domcontentloaded'});
      if(app!=='catalog')await page.waitForSelector('canvas',{state:'visible',timeout:20000});
      if(app==='ai3d-voxel-city'){
        await page.waitForFunction(()=>{
          const s=window.AI3DVoxelRuntime?.stats?.();
          return s?.defaultCityLoaded===true&&s.voxels>0&&s.chunks>0;
        },null,{timeout:20000});
        evidence.graphics=await captureLoadedGraphicsEvidence(page,{includePixelEvidence:true});
        expect(evidence.graphics.framing.rendererPixelEvidence?.composition?.pass).toBe(true);
      }else if(app==='voxel-world'){
        await page.waitForFunction(()=>window.VoxelWorldRuntime?.stats?.().playable===true,null,{timeout:20000});
        evidence.runtime=await page.evaluate(()=>window.VoxelWorldRuntime.stats());
      }
      evidence.status='CAPTURE_READY_NOT_APPROVED';
    }catch(error){evidence.status='FAILED';evidence.error=String(error.message);throw error;}
    finally{
      evidence.pageUrl=page.url();evidence.viewport=page.viewportSize();
      try{await page.screenshot({path:path.join(dir,`${app}.png`),fullPage:false});}
      catch(error){evidence.status='FAILED';evidence.screenshotError=String(error.message);}
      fs.writeFileSync(path.join(dir,`${app}.json`),JSON.stringify(evidence,null,2));
      await testInfo.attach('visual-candidate-evidence',{body:Buffer.from(JSON.stringify(evidence)),contentType:'application/json'});
    }
    expect(evidence.screenshotError).toBeUndefined();
  });
}
