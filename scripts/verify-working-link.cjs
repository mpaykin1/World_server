'use strict';
const { chromium, devices } = require('@playwright/test');
const { PNG } = require('pngjs');

const ERROR_MARKERS = ['site not found','page not found','404: not_found','deployment_not_found','vercel login','not found - request id'];
function parseArgs(argv){
  const out={url:argv[2]||'',game:false,readyGlobal:'',inventoryId:''};
  for(const a of argv.slice(3)){
    if(a==='--game') out.game=true;
    else if(a.startsWith('--ready-global=')) out.readyGlobal=a.slice(15);
    else if(a.startsWith('--inventory-id=')) out.inventoryId=a.slice(15);
  }
  return out;
}
function assertPublicUrl(raw){
  const u=new URL(raw);
  if(u.protocol!=='https:') throw new Error('Final delivery URL must be HTTPS');
  if(['localhost','127.0.0.1'].includes(u.hostname)) throw new Error('Final delivery URL cannot be localhost');
  return u;
}
function bodyLooksHealthy(text){
  const low=String(text||'').toLowerCase();
  return !ERROR_MARKERS.some(x=>low.includes(x));
}
function screenshotHasVisualSignal(buf){
  const png=PNG.sync.read(buf); let min=255,max=0,samples=0;
  const stride=Math.max(1,Math.floor((png.width*png.height)/2400));
  for(let i=0;i<png.width*png.height;i+=stride){
    const k=i*4; const lum=(png.data[k]*3+png.data[k+1]*4+png.data[k+2])/8;
    min=Math.min(min,lum); max=Math.max(max,lum); samples++;
  }
  return samples>20 && (max-min)>12;
}
async function httpGate(url){
  const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(20000),headers:{'user-agent':'WorldServerVerifiedLinkGate/1.0'}});
  const text=await r.text();
  if(r.status<200||r.status>=300) throw new Error(`HTTP ${r.status}`);
  if(!bodyLooksHealthy(text)) throw new Error('Host/error marker detected');
  if(text.length<120) throw new Error('HTML response is unexpectedly small');
  return {status:r.status,bytes:text.length,finalUrl:r.url};
}
async function browserGate(url,{game,readyGlobal,inventoryId}){
  const browser=await chromium.launch({headless:true});
  const profiles=game?[['desktop',devices['Desktop Chrome']],['mobile',devices['Pixel 7']]]:[['desktop',devices['Desktop Chrome']]];
  const evidence=[];
  try{
    for(const [name,device] of profiles){
      const context=await browser.newContext({...device}); const page=await context.newPage(); const pageErrors=[];
      page.on('pageerror',e=>pageErrors.push(String(e.message||e)));
      const response=await page.goto(url,{waitUntil:'domcontentloaded',timeout:30000});
      if(!response||!response.ok()) throw new Error(`${name}: browser HTTP ${response?.status()}`);
      await page.waitForTimeout(2600);
      const text=await page.locator('body').innerText().catch(()=> '');
      if(!bodyLooksHealthy(text)) throw new Error(`${name}: error marker in rendered page`);
      if(readyGlobal){
        const ready=await page.evaluate(n=>Boolean(globalThis[n]?.ready),readyGlobal);
        if(!ready) throw new Error(`${name}: ${readyGlobal}.ready is not true`);
      }
      if(game){
        const canvas=page.locator('canvas').first(); await canvas.waitFor({state:'visible',timeout:10000});
        const box=await canvas.boundingBox(); if(!box||box.width<200||box.height<180) throw new Error(`${name}: canvas is not visibly rendered`);
        const shot=await page.screenshot(); if(!screenshotHasVisualSignal(shot)) throw new Error(`${name}: screenshot has insufficient visual signal`);
      }
      if(inventoryId){
        await page.waitForFunction(id=>globalThis.GoldenUIShell?.getInventory?.().some(x=>x.id===id),inventoryId,{timeout:12000});
      }
      if(pageErrors.length) throw new Error(`${name}: page errors: ${pageErrors.join(' | ')}`);
      evidence.push({profile:name,title:await page.title(),url:page.url()}); await context.close();
    }
  } finally { await browser.close(); }
  return evidence;
}
async function main(){
  const args=parseArgs(process.argv); assertPublicUrl(args.url);
  const http=await httpGate(args.url); const browser=await browserGate(args.url,args);
  console.log(JSON.stringify({ok:true,verifiedAt:new Date().toISOString(),url:args.url,http,browser},null,2));
}
if(require.main===module) main().catch(e=>{console.error(`[VERIFIED_LINK_GATE] FAIL ${e.message}`);process.exit(1);});
module.exports={ERROR_MARKERS,parseArgs,assertPublicUrl,bodyLooksHealthy,screenshotHasVisualSignal,httpGate,browserGate};
