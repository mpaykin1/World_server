'use strict';
const fs=require('fs');
const path=require('path');
const {spawn,spawnSync}=require('child_process');
const {chromium,devices}=require('@playwright/test');
const root=path.resolve(__dirname,'..');
const registry=require(path.join(root,'data','app-release-registry.json'));
const outDir=path.join(root,'artifacts','world-fleet-audit');
const reportPath=path.join(root,'WORLD_FLEET_AUDIT.json');
fs.mkdirSync(outDir,{recursive:true});
const graphicalKinds=new Set(['game','navigator','experience']);
const localWorlds=Object.entries(registry.apps)
  .filter(([,v])=>graphicalKinds.has(v.kind))
  .map(([id,v])=>({id,title:v.title,kind:v.kind,source:'local',url:`http://127.0.0.1:3197/apps/${id}/`}));
const externalWorlds=(registry.externalWorlds||[]).map(v=>({...v,source:'external'}));
const worlds=[...localWorlds,...externalWorlds];
const safe=s=>String(s).replace(/[^a-z0-9_-]+/gi,'_');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
function metric(...files){
  const p=spawnSync('python',[path.join(root,'scripts','world-screenshot-metrics.py'),...files],{encoding:'utf8'});
  if(p.status!==0) return {error:(p.stderr||p.stdout||'metric failed').trim()};
  try{return JSON.parse(p.stdout.trim())}catch{return {error:'invalid metric json'}}
}
function playerPos(p){return p&&Number.isFinite(p.x)&&Number.isFinite(p.z)?{x:p.x,z:p.z}:null}
function moved(a,b){return !!(a&&b&&Math.hypot(b.x-a.x,b.z-a.z)>.01)}
async function shot(page,file){await page.screenshot({path:file,fullPage:false});return metric(file)}
async function runtimePlayer(page){
  return page.evaluate(()=>window.GamePlayableRuntime?.stats?.().player||null).catch(()=>null);
}
async function desktopAudit(browser,w){
  const context=await browser.newContext({...devices['Desktop Chrome']});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  page.on('console',m=>{if(m.type()==='error') errors.push(m.text())});
  const base=path.join(outDir,`${safe(w.id)}-desktop`);
  const result={open:false,visual:null,wasd:null,arrows:null,errors:[]};
  try{
    const r=await page.goto(w.url,{waitUntil:'domcontentloaded',timeout:30000});
    result.open=!!r&&r.status()<500; await sleep(1800);
    const beforeFile=`${base}-0.png`; result.visual=await shot(page,beforeFile);
    const runtime=await page.evaluate(()=>!!window.GamePlayableRuntime).catch(()=>false);
    await page.mouse.click(400,300).catch(()=>{});
    const p0=playerPos(await runtimePlayer(page));
    await page.keyboard.down('KeyW'); await sleep(350); await page.keyboard.up('KeyW');
    const p1=playerPos(await runtimePlayer(page)); const wFile=`${base}-w.png`; await shot(page,wFile);
    result.wasd=runtime?moved(p0,p1):metric(beforeFile,wFile).changed;
    const p2=playerPos(await runtimePlayer(page));
    await page.keyboard.down('ArrowUp'); await sleep(350); await page.keyboard.up('ArrowUp');
    const p3=playerPos(await runtimePlayer(page)); const aFile=`${base}-arrow.png`; await shot(page,aFile);
    result.arrows=runtime?moved(p2,p3):metric(wFile,aFile).changed;
  }catch(e){result.exception=String(e.message||e)}
  result.errors=[...new Set(errors)].slice(0,12); await context.close(); return result;
}
async function mobileAudit(browser,w){
  const context=await browser.newContext({...devices['Pixel 7'],hasTouch:true});
  const page=await context.newPage(); const errors=[];
  page.on('pageerror',e=>errors.push(String(e.message||e)));
  const base=path.join(outDir,`${safe(w.id)}-mobile`);
  const result={open:false,visual:null,joystick:null,look:null,errors:[]};
  try{
    const r=await page.goto(w.url,{waitUntil:'domcontentloaded',timeout:30000});
    result.open=!!r&&r.status()<500; await sleep(1800);
    const beforeFile=`${base}-0.png`; result.visual=await shot(page,beforeFile);
    const runtime=await page.evaluate(()=>!!window.GamePlayableRuntime).catch(()=>false);
    const pad=page.locator('#goldenMovePad,#movePad,.movePad,[data-control="move"]' ).first();
    if(await pad.count()&&await pad.isVisible().catch(()=>false)){
      const box=await pad.boundingBox(); const p0=playerPos(await runtimePlayer(page));
      if(box){const cx=box.x+box.width/2,cy=box.y+box.height/2; await page.mouse.move(cx,cy); await page.mouse.down(); await page.mouse.move(cx,cy-box.height*.35,{steps:5}); await sleep(450); await page.mouse.up();}
      const p1=playerPos(await runtimePlayer(page)); const after=`${base}-move.png`; await shot(page,after);
      result.joystick=runtime?moved(p0,p1):metric(beforeFile,after).changed;
    } else result.joystick=false;
    const look=page.locator('#goldenLookZone,#lookZone,.lookZone,[data-control="look"]' ).first();
    if(await look.count()&&await look.isVisible().catch(()=>false)){
      const box=await look.boundingBox(); const p0=await runtimePlayer(page);
      if(box){const cx=box.x+box.width/2,cy=box.y+box.height/2; await page.mouse.move(cx,cy); await page.mouse.down(); await page.mouse.move(cx-60,cy-35,{steps:5}); await sleep(300); await page.mouse.up();}
      const p1=await runtimePlayer(page); const after=`${base}-look.png`; await shot(page,after);
      result.look=runtime?!!(p0&&p1&&(Math.abs((p1.yaw||0)-(p0.yaw||0))+Math.abs((p1.pitch||0)-(p0.pitch||0))>.02)):metric(beforeFile,after).changed;
    } else result.look=false;
  }catch(e){result.exception=String(e.message||e)}
  result.errors=[...new Set(errors)].slice(0,12); await context.close(); return result;
}
function withTimeout(promise,ms,label){
  let timer; const timeout=new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error(label+' timeout')),ms));
  return Promise.race([promise,timeout]).finally(()=>clearTimeout(timer));
}
function save(rows){
  const summary={generatedAt:new Date().toISOString(),total:worlds.length,completed:rows.length,
    pass:rows.filter(r=>r.status==='PASS').length,fail:rows.filter(r=>r.status==='FAIL').length};
  fs.writeFileSync(reportPath,JSON.stringify({summary,worlds:rows},null,2)); return summary;
}
async function main(){
  const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3197'},stdio:['ignore','pipe','pipe']});
  server.stdout.on('data',()=>{}); server.stderr.on('data',()=>{});
  await sleep(1800); const browser=await chromium.launch({headless:true}); const rows=[];
  try{
    for(const w of worlds){
      process.stdout.write(`[world-audit] ${w.id} ... `);
      let desktop,mobile;
      try{desktop=await withTimeout(desktopAudit(browser,w),45000,`${w.id} desktop`)}
      catch(e){desktop={open:false,exception:String(e.message||e)}}
      try{mobile=await withTimeout(mobileAudit(browser,w),45000,`${w.id} mobile`)}
      catch(e){mobile={open:false,exception:String(e.message||e)}}
      const checks={open:desktop.open===true&&mobile.open===true,
        graphics:!!desktop.visual?.nonBlank&&!!mobile.visual?.nonBlank,
        wasd:desktop.wasd===true,arrows:desktop.arrows===true,
        joystick:mobile.joystick===true,mobileLook:mobile.look===true};
      const status=Object.values(checks).every(Boolean)?'PASS':'FAIL';
      rows.push({id:w.id,title:w.title,source:w.source,url:w.url,status,checks,desktop,mobile});
      save(rows); console.log(status);
    }
  } finally {await browser.close().catch(()=>{}); server.kill();}
  const summary=save(rows); console.log(`[world-audit] report ${reportPath}`); console.log(JSON.stringify(summary));
  process.exitCode=summary.fail?2:0;
}
main().catch(e=>{console.error(e);process.exitCode=1});
