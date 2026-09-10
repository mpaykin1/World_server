const {test,expect}=require('@playwright/test');
const fs=require('fs'),path=require('path');
const manifest=require('../data/visual-baselines.json');

const approved=manifest.approvedBaselines||[];

async function captureRenderedPixelEvidence(page){
  const selector='[data-golden-primary-renderer] canvas, #viewer canvas, canvas';
  try{
    const canvas=page.locator(selector).first();
    const png=await canvas.screenshot({animations:'disabled',caret:'hide'});
    return await page.evaluate(async base64=>{
      const img=new Image();
      await new Promise((resolve,reject)=>{
        img.onload=resolve;
        img.onerror=()=>reject(new Error('renderer screenshot decode failed'));
        img.src=`data:image/png;base64,${base64}`;
      });
      const sample=document.createElement('canvas');
      sample.width=24;sample.height=14;
      const ctx=sample.getContext('2d',{willReadFrequently:true});
      ctx.drawImage(img,0,0,sample.width,sample.height);
      const pixels=ctx.getImageData(0,0,sample.width,sample.height).data;
      const rows=[];const unique=new Set();let opaque=0,luma=0;
      for(let y=0;y<sample.height;y++){
        let row='';
        for(let x=0;x<sample.width;x++){
          const i=(y*sample.width+x)*4;
          const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3];
          const q=`${(r>>4).toString(16)}${(g>>4).toString(16)}${(b>>4).toString(16)}`;
          row+=q;unique.add(q);if(a>0)opaque++;luma+=(.2126*r+.7152*g+.0722*b);
        }
        rows.push(row);
      }
      // A loaded renderer can still be visually unusable when one smooth facade,
      // overhang or ground plane owns almost the whole frame. Measure real composed
      // pixels, not geometry telemetry, so finalViewEligible cannot certify a
      // low-articulation frame by itself.
      let neighborPairs=0,strongEdgePairs=0;
      const colorDistance=(a,b)=>{
        const dr=pixels[a]-pixels[b],dg=pixels[a+1]-pixels[b+1],db=pixels[a+2]-pixels[b+2];
        return Math.hypot(dr,dg,db);
      };
      for(let y=0;y<sample.height;y++)for(let x=0;x<sample.width;x++){
        const i=(y*sample.width+x)*4;
        if(x+1<sample.width){neighborPairs++;if(colorDistance(i,i+4)>=32)strongEdgePairs++;}
        if(y+1<sample.height){neighborPairs++;if(colorDistance(i,i+sample.width*4)>=32)strongEdgePairs++;}
      }
      const strongEdgeRatio=strongEdgePairs/Math.max(1,neighborPairs);
      const compositionPass=unique.size>=8&&opaque/(sample.width*sample.height)>=.9&&strongEdgeRatio>=.13;
      return {
        source:'playwright-rendered-canvas-screenshot',
        correlation:'same-loaded-state-immediately-before-screenshot-assertion',
        width:sample.width,height:sample.height,encoding:'rgb444-row-major-hex',rows,
        uniqueQuantizedColors:unique.size,
        meanLuma:Number((luma/Math.max(1,sample.width*sample.height)).toFixed(2)),
        opaqueRatio:Number((opaque/Math.max(1,sample.width*sample.height)).toFixed(4)),
        composition:{
          source:'same-composited-rgb-grid',
          strongEdgePairs,
          neighborPairs,
          strongEdgeRatio:Number(strongEdgeRatio.toFixed(4)),
          minimumStrongEdgeRatio:.13,
          pass:compositionPass,
          classification:compositionPass?'PIXEL_COMPOSITION_ARTICULATED':'VISIBLE_BUT_LOW_DEPTH_ARTICULATION'
        }
      };
    },png.toString('base64'));
  }catch(error){
    return {source:'playwright-rendered-canvas-screenshot',correlation:'same-loaded-state-immediately-before-screenshot-assertion',error:String(error?.message||error)};
  }
}

async function captureLoadedGraphicsEvidence(page,{includePixelEvidence=false}={}){
  const evidence=await page.evaluate(() => {
    const runtime=window.AI3DVoxelRuntime;
    const stats=runtime?.stats?.()||{};
    const canvas=document.querySelector('[data-golden-primary-renderer] canvas')||document.querySelector('#viewer canvas')||document.querySelector('canvas');
    const rendererHost=document.querySelector('[data-golden-primary-renderer]')||document.querySelector('#viewer')||canvas;
    const rect=rendererHost?.getBoundingClientRect?.();
    const viewport={width:innerWidth,height:innerHeight,orientation:innerWidth>=innerHeight?'landscape':'portrait'};
    const doc=document.documentElement;
    const drawer=document.querySelector('#goldenDrawer');
    const drawerRect=drawer?.getBoundingClientRect?.();
    const drawerOpen=drawer?.getAttribute('aria-hidden')==='false'||drawer?.classList?.contains('open')||false;
    const viewportArea=Math.max(1,viewport.width*viewport.height);
    const drawerArea=drawerOpen&&drawerRect?Math.max(0,drawerRect.width)*Math.max(0,drawerRect.height):0;
    let webglReady=false;
    try{webglReady=!!(canvas?.getContext?.('webgl2')||canvas?.getContext?.('webgl'));}catch{}
    const player=stats.player||{};
    const facing=stats.initialVisibleFacing||{};
    const rendererStats=stats.renderer||{};
    const body=document.body;
    const isVisible=el=>{
      if(!el)return false;
      const r=el.getBoundingClientRect();
      const s=getComputedStyle(el);
      return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden'&&Number(s.opacity||1)>0;
    };
    const visibleActionLabels=[...document.querySelectorAll('button,[role="button"]')]
      .filter(isVisible)
      .map(el=>(el.getAttribute('aria-label')||el.textContent||el.id||'').trim())
      .filter(Boolean)
      .slice(0,24);
    const nearSurfaceCoverage=Number(facing.nearSurfaceCoverage);
    const centerNearSurfaceCoverage=Number(facing.centerNearSurfaceCoverage);
    const nearSurfaceCoverageRatio=Number.isFinite(nearSurfaceCoverage)?nearSurfaceCoverage/96:null;
    const centerNearSurfaceCoverageRatio=Number.isFinite(centerNearSurfaceCoverage)?centerNearSurfaceCoverage/36:null;
    let visibleFrameClassification='INCONCLUSIVE';
    if(stats.defaultCityLoaded===true&&(Number(rendererStats.triangles)||0)>0){
      if((centerNearSurfaceCoverageRatio??0)>=0.5||(nearSurfaceCoverageRatio??0)>=0.5)visibleFrameClassification='VISIBLE_BUT_BAD_FRAMING';
      else visibleFrameClassification='VISIBLE_GAME_CONTENT';
    }
    return {
      pageUrl:location.href,
      defaultCityLoaded:stats.defaultCityLoaded===true,
      voxels:Number(stats.voxels)||0,
      chunks:Number(stats.chunks)||0,
      renderedTriangles:Number(rendererStats.triangles)||0,
      drawCalls:Number(rendererStats.calls)||0,
      webglReady,
      viewport,
      primaryRendererBounds:rect?{x:rect.x,y:rect.y,width:rect.width,height:rect.height}:null,
      rendererWidthRatio:rect?rect.width/Math.max(1,viewport.width):null,
      rendererHeightRatio:rect?rect.height/Math.max(1,viewport.height):null,
      gameplayScrollRatio:{
        width:Math.max(doc.scrollWidth,body?.scrollWidth||0)/Math.max(1,viewport.width),
        height:Math.max(doc.scrollHeight,body?.scrollHeight||0)/Math.max(1,viewport.height)
      },
      closedAuxiliaryOcclusionRatio:drawerOpen?drawerArea/viewportArea:0,
      camera:{x:Number(player.x)||0,y:Number(player.y)||0,z:Number(player.z)||0,yaw:Number(player.yaw)||0,pitch:Number(player.pitch)||0,playable:player.playable===true},
      selectedFacing:facing,
      framing:{nearSurfaceCoverage,centerNearSurfaceCoverage,nearSurfaceCoverageRatio,centerNearSurfaceCoverageRatio,visibleFrameClassification,rendererPixelEvidence:null},
      controls:{
        move:player.playable===true,
        look:typeof runtime?.setView==='function'||typeof runtime?.setPlayerView==='function',
        toolbarUsable:!!document.querySelector('#goldenToolbar button'),
        canvasPresent:!!canvas,
        essentialActions:{
          visibleActionCount:visibleActionLabels.length,
          visibleActionLabels,
          jumpVisible:visibleActionLabels.some(label=>/jump|прыж/i.test(label)),
          menuVisible:visibleActionLabels.some(label=>/menu|меню|world|мир/i.test(label))
        }
      },
      pageErrors:[],
      consoleErrors:[]
    };
  });
  if(includePixelEvidence)evidence.framing.rendererPixelEvidence=await captureRenderedPixelEvidence(page);
  return evidence;
}

async function captureResizeOrientationEvidence(page){
  const original=page.viewportSize();
  if(!original||original.width===original.height)return {supported:false,reason:'square-or-unknown-viewport'};
  const probe={width:original.height,height:original.width};
  await page.setViewportSize(probe);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const afterOrientationChange=await captureLoadedGraphicsEvidence(page);
  await page.setViewportSize(original);
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const afterRestore=await captureLoadedGraphicsEvidence(page);
  return {supported:true,original,probe,afterOrientationChange,afterRestore};
}

for(const b of approved){
  test(`perceptual-baseline ${b.id}`,async({page},testInfo)=>{
    const app=b.app||String(b.id).split(':')[0]||'catalog';
    const pageErrors=[];const consoleErrors=[];const failedHttpResponses=[];
    page.on('pageerror',e=>pageErrors.push(String(e?.message||e)));
    page.on('console',msg=>{if(msg.type()==='error')consoleErrors.push(msg.text());});
    page.on('response',response=>{
      const status=response.status();
      if(status>=400){
        const request=response.request();
        failedHttpResponses.push({status,url:response.url(),method:request.method(),resourceType:request.resourceType()});
      }
    });
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
    if(app==='ai3d-voxel-city'){
      const resizeOrientation=await captureResizeOrientationEvidence(page);
      const evidence=await captureLoadedGraphicsEvidence(page,{includePixelEvidence:true});
      evidence.pageErrors=pageErrors.slice();
      evidence.consoleErrors=consoleErrors.slice();
      evidence.failedHttpResponses=failedHttpResponses.slice();
      evidence.framing.failedHttpResponses=failedHttpResponses.slice();
      evidence.screenshotIdentity=path.basename(b.path);
      evidence.project=testInfo.project.name;
      evidence.postResizeOrientation=resizeOrientation;
      testInfo.annotations.push({type:'loaded-state-graphics-evidence',description:JSON.stringify(evidence)});
      await testInfo.attach('loaded-state-graphics-evidence.json',{body:Buffer.from(`${JSON.stringify(evidence,null,2)}\n`),contentType:'application/json'});
      // Fail closed before baseline comparison when actual loaded-state pixels are
      // dominated by low-articulation surfaces. This is additive: the protected
      // screenshot assertion and all existing thresholds remain unchanged.
      expect(evidence.framing.rendererPixelEvidence?.composition?.pass).toBe(true);
    }
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