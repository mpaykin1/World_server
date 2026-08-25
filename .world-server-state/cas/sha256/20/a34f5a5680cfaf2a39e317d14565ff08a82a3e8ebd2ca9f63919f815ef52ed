// V8 real Playwright WebGPU device farm; renderer promotion is blocked unless required WebGPU profiles pass.
import fs from 'node:fs/promises';
import process from 'node:process';
const root=new URL('../',import.meta.url);const matrix=JSON.parse(await fs.readFile(new URL('../quality/device-matrix.json',import.meta.url),'utf8'));
const url=process.env.QUALITY_TARGET_URL||process.argv[2]||'http://127.0.0.1:8000/';
let chromium;try{({chromium}=await import('playwright'));}catch(e){console.error(JSON.stringify({pass:false,state:'playwright-not-installed',reason:String(e.message)}));process.exit(2);}
const results=[];
for(const profile of matrix.profiles){
  const args=['--enable-unsafe-webgpu','--enable-features=Vulkan,UseSkiaRenderer'];
  const browser=await chromium.launch({headless:true,args});const context=await browser.newContext({viewport:profile.viewport,deviceScaleFactor:profile.deviceScaleFactor||1,isMobile:!!profile.isMobile,hasTouch:!!profile.hasTouch});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  const t0=Date.now();let state='ok',webgpu=false,fps=0,quality='';
  try{
    await page.goto(url,{waitUntil:'networkidle',timeout:60000});webgpu=await page.evaluate(()=>!!navigator.gpu);const btn=page.locator('#enterButton');if(await btn.isVisible())await btn.click();await page.waitForTimeout(3500);
    const data=await page.evaluate(()=>({badge:document.querySelector('#debugBadge')?.textContent||'',quality:document.querySelector('#qualityStatus')?.textContent||'',fatal:!document.querySelector('#fatal')?.classList.contains('hidden')}));quality=data.quality;const m=data.badge.match(/FPS\s*[:=]?\s*(\d+(?:\.\d+)?)/i);fps=m?Number(m[1]):0;if(data.fatal)state='fatal';
  }catch(e){state='error';errors.push(String(e));}
  const pass=state==='ok'&&errors.length===0&&(!profile.webgpuRequired||webgpu)&&(fps===0||fps>=profile.minFps)&&/PASS/i.test(quality);
  results.push({profile:profile.id,pass,state,webgpu,fps,minFps:profile.minFps,quality,errors,durationMs:Date.now()-t0,nearFieldGoldenRequired:!!profile.nearFieldGolden});await browser.close();
}
const report={schemaVersion:1,pass:results.every(r=>r.pass),mode:'real-browser-device-matrix-v1',target:url,results,nearFieldQualityLossAllowed:false};await fs.mkdir(new URL('../quality/reports/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../quality/reports/device-farm.json',import.meta.url),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));process.exit(report.pass?0:1);
