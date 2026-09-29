#!/usr/bin/env node
'use strict';
const {spawn}=require('node:child_process');
const {mkdirSync,writeFileSync}=require('node:fs');
const path=require('node:path'),os=require('node:os'),http=require('node:http');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..'),port=32079,target='http://127.0.0.1:'+port+'/apps/voxel-art-lab/';
const origin=new URL(target).origin,out=path.join(os.tmpdir(),'ws-voxel-art-browser-smoke');
const kinds=['barren','city','forest','volcano','energy','idea','river','villager'];
mkdirSync(out,{recursive:true});
const proc=spawn(process.execPath,[path.join(root,'server.js')],{cwd:root,env:{...process.env,PORT:String(port)},stdio:'ignore'});
async function ready(){
  for(let i=0;i<80;i++){
    const ok=await new Promise(resolve=>http.get(target,r=>{r.resume();resolve(r.statusCode===200);}).on('error',()=>resolve(false)));
    if(ok)return;await new Promise(r=>setTimeout(r,200));
  }
  throw new Error('Server did not become ready: '+target);
}
async function frameSample(page){
  const intervals=await page.evaluate(()=>new Promise(resolve=>{
    const rows=[];let previous=performance.now(),count=0;
    const next=now=>{rows.push(now-previous);previous=now;if(++count>=100)resolve(rows);else requestAnimationFrame(next);};
    requestAnimationFrame(next);
  }));
  const sorted=[...intervals].sort((a,b)=>a-b),mean=intervals.reduce((a,b)=>a+b,0)/intervals.length;
  return{fps:Number((1000/mean).toFixed(1)),p95FrameMs:Number(sorted[Math.floor(sorted.length*.95)].toFixed(2))};
}
async function waitState(page,kind,version,lod){
  await page.waitForFunction(({kind,version,lod})=>{
    const s=window.__voxelViewerStats?.();return s&&s.kind===kind&&s.version===version&&s.lod===lod&&
      document.querySelector('#status')?.textContent.startsWith(kind+' · ');
  },{kind,version,lod},{timeout:25000});
}
async function pinch(page){
  const box=await page.locator('canvas').boundingBox();if(!box)throw new Error('No canvas for pinch');
  const session=await page.context().newCDPSession(page),cx=box.x+box.width*.55,cy=box.y+box.height*.7;
  const point=(x,id)=>({x,y:cy,id,radiusX:3,radiusY:3,force:1});
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point(cx-35,1),point(cx+35,2)]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[point(cx-85,1),point(cx+85,2)]});
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
}
async function view(browser,name,viewport,isMobile,dpr){
  const context=await browser.newContext({viewport,isMobile,deviceScaleFactor:dpr,hasTouch:isMobile});
  const page=await context.newPage(),faults=[],external=[];
  page.on('pageerror',e=>faults.push(e.message));
  page.on('request',request=>{const u=new URL(request.url());if(/^https?:$/.test(u.protocol)&&u.origin!==origin)external.push(request.url());});
  await page.goto(target,{waitUntil:'domcontentloaded'});
  await waitState(page,'barren','new',0);
  for(const kind of kinds){
    await page.locator('button[data-kind="'+kind+'"]').click();await waitState(page,kind,'new',0);
    await page.screenshot({path:path.join(out,name+'-'+kind+'-new-lod0.png')});
    for(const lod of [1,2]){
      await page.locator('button[data-lod="'+lod+'"]').click();await waitState(page,kind,'new',lod);
      const stats=await page.evaluate(()=>window.__voxelViewerStats());if(stats.render.triangles<=0)throw new Error(kind+' empty LOD'+lod);
    }
    await page.locator('button[data-lod="0"]').click();await waitState(page,kind,'new',0);
    await page.locator('button[data-version="old"]').click();await waitState(page,kind,'old',0);
    if(kind==='volcano')await page.screenshot({path:path.join(out,name+'-volcano-old.png')});
    await page.locator('button[data-version="new"]').click();await waitState(page,kind,'new',0);
  }
  await page.locator('button[data-kind="volcano"]').click();await waitState(page,'volcano','new',0);
  await page.locator('#semantic').click();
  await page.waitForFunction(()=>window.__voxelViewerStats?.().debugBoxes>0,{timeout:10000});
  await page.screenshot({path:path.join(out,name+'-volcano-semantic-debug.png')});
  await page.locator('#semantic').click();
  await page.waitForFunction(()=>window.__voxelViewerStats?.().debugBoxes===0);
  await page.locator('#animation').click();
  if(await page.locator('#animation').getAttribute('aria-pressed')!=='false')throw new Error('Animation toggle failed');
  await page.locator('#animation').click();
  const before=await page.evaluate(()=>window.__voxelViewerStats().zoom);
  if(isMobile)await pinch(page);else await page.locator('canvas').dispatchEvent('wheel',{deltaY:-420});
  await page.waitForTimeout(120);
  const after=await page.evaluate(()=>window.__voxelViewerStats().zoom);
  if(Math.abs(after-before)<.02)throw new Error((isMobile?'Pinch':'Wheel')+' zoom failed');
  const canvas=await page.locator('canvas').evaluate(node=>({width:node.width,height:node.height,display:getComputedStyle(node).display}));
  if(canvas.width<=0||canvas.height<=0)throw new Error('Canvas is empty');
  const perf=await frameSample(page),memory=await page.evaluate(()=>performance.memory?.usedJSHeapSize||null);
  const stats=await page.evaluate(()=>window.__voxelViewerStats());
  if(external.length)throw new Error('Offline viewer made external requests: '+[...new Set(external)].join(', '));
  if(faults.length)throw new Error('Page errors: '+faults.join('; '));
  const metrics={name,viewport,canvas,perf,memory,render:stats.render,cacheEntries:stats.cacheEntries};
  console.log('[VOXEL_ART_E2E]',JSON.stringify(metrics));await context.close();return metrics;
}
(async()=>{
  await ready();const browser=await chromium.launch({channel:'msedge',headless:true,args:['--disable-gpu-sandbox']});
  try{
    const metrics=[
      await view(browser,'desktop',{width:1365,height:768},false,1),
      await view(browser,'mobile',{width:390,height:844},true,1),
    ];
    writeFileSync(path.join(out,'metrics.json'),JSON.stringify(metrics,null,2));
    console.log('[VOXEL_ART_E2E] PASS 8 models × OLD/NEW × LOD0/1/2; offline; screenshots:',out);
  }finally{await browser.close();}
})().catch(error=>{console.error('[VOXEL_ART_E2E] FAIL',error);process.exitCode=1;})
  .finally(()=>proc.kill());
