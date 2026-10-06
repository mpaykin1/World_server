'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {chromium}=require('@playwright/test');
const {PNG}=require('pngjs');

const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'test-results');
fs.mkdirSync(OUT,{recursive:true});

function pixelDiff(a,b){
  const pa=PNG.sync.read(a),pb=PNG.sync.read(b);
  assert.equal(pa.width,pb.width);assert.equal(pa.height,pb.height);
  let changed=0,total=pa.width*pa.height;
  for(let i=0;i<pa.data.length;i+=4){
    const d=Math.abs(pa.data[i]-pb.data[i])+Math.abs(pa.data[i+1]-pb.data[i+1])+Math.abs(pa.data[i+2]-pb.data[i+2]);
    if(d>42)changed++;
  }
  return changed/total;
}
async function ready(page){
  await page.waitForFunction(()=>window.__KRIEGER_MVP_STATE__?.ready===true,{timeout:10000});
}
async function main(){
  const browser=await chromium.launch({headless:true,executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'});
  const errors=[];
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:8790/apps/krieger-game-forge/',{waitUntil:'networkidle'});
  await ready(page);
  const state=await page.evaluate(()=>window.__KRIEGER_MVP_STATE__);
  assert.equal(state.upstreamCommit,'3bf0ff017372e640e966c2785a4d95a998cec242');
  for(const f of ['geometry','scene','material','weapon','creature','collision','logic','audio'])assert.ok(state.families.includes(f),f);
  assert.ok(state.nodeCount>20);
  const p0=await page.evaluate(()=>window.__KRIEGER_FORGE__.getRuntime().player);
  await page.keyboard.down('KeyW');await page.waitForTimeout(180);await page.keyboard.up('KeyW');
  const p1=await page.evaluate(()=>window.__KRIEGER_FORGE__.getRuntime().player);assert.ok(p1.z<p0.z-.3,'movement did not advance');
  await page.evaluate(()=>window.__KRIEGER_FORGE__.fire());
  const shot=await page.evaluate(()=>window.__KRIEGER_FORGE__.getRuntime());assert.ok(shot.bullets>0,'fire did not spawn projectile');
  const canvas=await page.locator('#game').boundingBox();assert.ok(canvas.width>=1400&&canvas.height>=880);
  for(const selector of ['#generate','[data-mutate="height"]','#fireBtn','.compiler-strip'])assert.ok(await page.locator(selector).count());
  const before=await page.screenshot({path:path.join(OUT,'krieger-game-forge-desktop-before.png')});
  const oldHash=state.recipeHash;
  await page.click('[data-mutate="height"]');
  await page.waitForFunction(h=>window.__KRIEGER_MVP_STATE__.recipeHash!==h,oldHash);
  const afterState=await page.evaluate(()=>window.__KRIEGER_MVP_STATE__);
  assert.ok(afterState.changedSemantics.some(x=>x.includes(':scene')));
  const after=await page.screenshot({path:path.join(OUT,'krieger-game-forge-desktop.png')});
  const visualDelta=pixelDiff(before,after);
  assert.ok(visualDelta>.004,'visual mutation delta too small: '+visualDelta);
  await page.selectOption('#preset','gothic');await ready(page);
  await page.waitForTimeout(150);
  const gothic=await page.evaluate(()=>window.__KRIEGER_MVP_STATE__);
  assert.equal(gothic.preset,'gothic');assert.ok(gothic.nodeCount>20);
  await context.close();

  const mobile=await browser.newContext({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
  const mp=await mobile.newPage();mp.on('pageerror',e=>errors.push(String(e)));
  await mp.goto('http://127.0.0.1:8790/apps/krieger-game-forge/',{waitUntil:'networkidle'});await ready(mp);
  assert.ok(await mp.locator('#fireBtn').isVisible());
  assert.ok(await mp.locator('#moveZone').isVisible());
  const fireBox=await mp.locator('#fireBtn').boundingBox();assert.ok(fireBox.width>=80&&fireBox.height>=80);
  const forgeBox=await mp.locator('#forge').boundingBox();assert.ok(forgeBox.x>=0&&forgeBox.y>=0&&forgeBox.x+forgeBox.width<=390);
  await mp.screenshot({path:path.join(OUT,'krieger-game-forge-mobile.png')});
  await mobile.close();await browser.close();
  assert.deepEqual(errors,[]);
  const score=(canvas.width>=1400?25:0)+20+20+20+(visualDelta>.004?15:0);
  const result={pass:true,noticeabilityScore:score,visualMutationPixelRatio:Number(visualDelta.toFixed(4)),state:afterState,mobile:{fireButton:fireBox,forge:forgeBox},consoleErrors:errors};
  fs.writeFileSync(path.join(OUT,'krieger-game-forge-browser-check.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
}
main().catch(err=>{console.error(err);process.exit(1)});
