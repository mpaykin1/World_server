import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const candidate = process.argv.length === 3 && process.argv[2] === '--publication-candidate';
const composed = candidate || (process.argv.length === 3 && process.argv[2] === '--composed');
if (process.argv.length > 2 && !composed) throw new Error('Only --composed or --publication-candidate is accepted');
const output = candidate ? 'generated/meta-games/generated-confluence-vault' : composed ? 'generated/meta-games/composed-vault' : 'generated/meta-games/witness-vault';
const entry = path.resolve(output, 'index.html');
assert.ok(fs.existsSync(entry), 'Canonical builder must produce an HTML artifact');
if (candidate) {
  const manifest = JSON.parse(fs.readFileSync(path.join(output,'manifest.json'),'utf8'));
  assert.equal(manifest.game_id,'generated-confluence-vault');
  console.log('PUBLICATION_CANDIDATE',JSON.stringify({game_id:manifest.game_id,
    source_commit:manifest.source_commit,manifest_sha256:manifest.manifest_sha256}));
}
const browser = await chromium.launch({ headless: true, args: [
  '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--ignore-gpu-blocklist','--disable-dev-shm-usage'
]});
const failures=[];
async function visit(options) {
  const ctx=await browser.newContext(options);
  const page=await ctx.newPage();
  page.on('pageerror',e=>failures.push('JS '+String(e)));
  page.on('console',m=>{if(m.type()==='error')failures.push('console '+m.text());});
  await page.goto(pathToFileURL(entry).href,{waitUntil:'load'});
  await page.waitForFunction(()=>window.__metaGamesState?.().ready,{timeout:30000});
  if (composed) {
    const world = await page.locator('#game-data').evaluate(el=>JSON.parse(el.textContent).world);
    assert.equal(world.solids.length,10,'Both generated world geometries reach the browser');
    assert.deepEqual(world.solids[5].min,{x:21,y:-1,z:-18},'Second source is translated');
    assert.equal(world.assetComposition.parts.length,2);
    assert.match(world.assetComposition.composition_id,/^[a-f0-9]{64}$/);
    assert.notEqual(world.assetComposition.parts[0].artifact_id,world.assetComposition.parts[1].artifact_id);
    assert.match(world.assetComposition.source_commit,/^[a-f0-9]{40}$/);
  }
  const data=await page.evaluate(()=>window.__metaGamesState());
  assert.deepEqual(data.errors,[],'WebGL shaders and physics start without errors');
  assert.equal(data.webgl2,true);
  assert.equal(data.scrollX,0);assert.equal(data.scrollY,0);
  return {ctx,page,rect:await page.locator('#screen').boundingBox()};
}
try{
  const {ctx,page,rect}=await visit({viewport:{width:1100,height:740}});
  assert.ok(rect.width>500&&rect.height>400);
  assert.equal(await page.locator('#jump').isVisible(),false);
  await page.screenshot({path:path.join(output,'desktop-initial.png')});
  await page.keyboard.press('e');
  await page.waitForFunction(()=>window.__metaGamesState().visited===1&&window.__metaGamesState().menu);
  assert.equal(await page.locator('#menu').isVisible(),true);
  // All scene choices must be earned by actual interactions, not mutated test state.
  for(let i=0;i<6;i++){
    if(i){
      const markerZ=2+6*i;
      await page.keyboard.down('w');
      await page.waitForFunction(target=>window.__metaGamesState().z>target-2.0,markerZ,{timeout:17000});
      await page.keyboard.up('w');
      await page.keyboard.press('e');
      await page.waitForFunction(count=>window.__metaGamesState().visited===count,i+1,{timeout:5000});
    }
    let tries=0;
    while(await page.locator('#menu').isVisible()&&tries++<12) {
      const label=await page.locator('#title').textContent();
      if(label?.includes('THE VAULT'))break;
      await page.locator('#options button').first().click();
      await page.waitForTimeout(40);
    }
    assert.ok(tries<12,'All scene choices resolve without a loop');
  }
  await page.waitForFunction(()=>window.__metaGamesState().won,{timeout:5000});
  const won=await page.evaluate(()=>window.__metaGamesState());
  assert.equal(won.visited,6);assert.ok(won.selections>=5);
  assert.ok(won.ending);assert.deepEqual(won.errors,[]);
  assert.deepEqual(await page.locator('#screen').boundingBox(),rect);
  await ctx.close();
  const {ctx:mobileCtx,page:phone,rect:mobileRect}=await visit({
    viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:2
  });
  assert.equal(await phone.locator('#jump').isVisible(),true);
  assert.equal(await phone.locator('#use').isVisible(),true);
  await phone.screenshot({path:path.join(output,'mobile-initial.png')});
  const session=await mobileCtx.newCDPSession(phone);
  const start=await phone.evaluate(()=>window.__metaGamesState());
  await session.send('Input.dispatchTouchEvent',{type:'touchStart',
    touchPoints:[{x:85,y:600,id:1},{x:290,y:440,id:2}]});
  await session.send('Input.dispatchTouchEvent',{type:'touchMove',
    touchPoints:[{x:85,y:515,id:1},{x:335,y:420,id:2}]});
  await phone.waitForTimeout(1100);
  await session.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const end=await phone.evaluate(()=>window.__metaGamesState());
  assert.ok(Math.hypot(end.x-start.x,end.z-start.z)>.1,'Mobile stick moves the hero');
  assert.ok(Math.hypot(end.camera.x-start.camera.x,end.camera.z-start.camera.z)>.1,
    'Camera follows hero during an independent two-touch input');
  const startAzimuth=Math.atan2(start.camera.x-start.x,start.camera.z-start.z);
  const endAzimuth=Math.atan2(end.camera.x-end.x,end.camera.z-end.z);
  const orbitDelta=Math.abs(Math.atan2(Math.sin(endAzimuth-startAzimuth),
    Math.cos(endAzimuth-startAzimuth)));
  assert.ok(orbitDelta>.05,'Right finger must orbit independently of hero following');
  console.log('MOBILE_ORBIT_RADIANS',orbitDelta);
  assert.equal(end.scrollY,0);assert.equal(end.scrollX,0);
  assert.deepEqual(await phone.locator('#screen').boundingBox(),mobileRect);
  assert.deepEqual(end.errors,[]);
  console.log('MOBILE_VIEW',JSON.stringify({start,end}));
  await phone.screenshot({path:path.join(output,'mobile.png')});
  await mobileCtx.close();
  assert.deepEqual(failures,[],'No JS/console errors');
  console.log(candidate ? 'PUBLICATION CANDIDATE WORLD' : composed ? 'COMPOSED WORLD' : 'BASE WORLD');
  console.log('GENERATED WEBGL2 BROWSER PASS: desktop six scenes/earned ending, real GLSL, mobile touch, fixed viewport');
}finally{await browser.close();}
