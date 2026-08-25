import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const base=process.env.WORLD_BASE_URL || 'http://127.0.0.1:8000/';
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'worlds/registry.json'),'utf8'));
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--disable-dev-shm-usage']});
const report={schemaVersion:2,pass:true,baseUrl:base,worlds:[],errors:[]};
function assert(cond,msg){if(!cond)throw new Error(msg)}

for(const entry of registry.worlds.filter(w=>w.enabled!==false)){
  const ctx=await browser.newContext({viewport:{width:1280,height:720},deviceScaleFactor:1});
  const page=await ctx.newPage();
  const wr={id:entry.id,pass:true,tests:[],warnings:[]}; report.worlds.push(wr);
  const test=async(id,fn)=>{try{await fn();wr.tests.push({id,pass:true});}catch(e){wr.pass=false;report.pass=false;wr.tests.push({id,pass:false,error:e.message});report.errors.push(`${entry.id}:${id}:${e.message}`)}};
  try{
    await page.goto(`${base}?world=${encodeURIComponent(entry.id)}&qa=1`,{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForFunction(()=>window.__WORLD_QA__?.getSnapshot,{timeout:120000});
    await page.waitForTimeout(1800);
    await test('spawn-grounded',async()=>{const s=await page.evaluate(()=>window.__WORLD_QA__.getSnapshot());assert(s.grounded===true,`spawn not grounded: ${JSON.stringify(s.position)}`)});
    await test('camera-roll-zero',async()=>{const r=await page.evaluate(()=>window.__WORLD_QA__.getSnapshot().roll);assert(Math.abs(r)<1e-9,`roll=${r}`)});
    await test('jump-world-y-only',async()=>{
      const r=await page.evaluate(()=>{const p=window.__WORLD_QA__.player;p.velocity.set(0,0,0);p.grounded=true;const x=p.position.x,z=p.position.z;p.setInput({moveX:0,moveForward:0,lookX:0,lookY:0,jump:true});p.update(1/30);return {vx:p.velocity.x,vy:p.velocity.y,vz:p.velocity.z,dx:p.position.x-x,dz:p.position.z-z};});
      assert(r.vy>0,`jump vy=${r.vy}`);assert(Math.abs(r.vx)<0.02&&Math.abs(r.vz)<0.02,`jump adds horizontal velocity ${JSON.stringify(r)}`);assert(Math.hypot(r.dx,r.dz)<0.02,'jump displaced horizontally');
    });
    await test('pitch-plus-minus-89',async()=>{
      const r=await page.evaluate(()=>{const p=window.__WORLD_QA__.player;p.pitch=0;p.setInput({lookX:0,lookY:-100000,moveX:0,moveForward:0,jump:false});const up=p.pitch;p.setInput({lookX:0,lookY:200000,moveX:0,moveForward:0,jump:false});return {up,down:p.pitch,roll:p.camera.rotation.z};});
      const lim=89*Math.PI/180;assert(Math.abs(r.up-lim)<1e-6,`up pitch ${r.up}`);assert(Math.abs(r.down+lim)<1e-6,`down pitch ${r.down}`);assert(Math.abs(r.roll)<1e-9,'roll changed during look');
    });
    await test('horizontal-look-yaw-only',async()=>{
      const r=await page.evaluate(()=>{const p=window.__WORLD_QA__.player;p.pitch=0;p.yaw=0;p.setInput({lookX:500,lookY:0,moveX:0,moveForward:0,jump:false});p.update(1/60);return {yaw:p.yaw,pitch:p.pitch,roll:p.camera.rotation.z};});
      assert(Math.abs(r.yaw)>0.1,'horizontal look did not change yaw');assert(Math.abs(r.pitch)<1e-9,'horizontal look changed pitch');assert(Math.abs(r.roll)<1e-9,'horizontal look changed roll');
    });
    await test('forward-planar-camera',async()=>{
      const r=await page.evaluate(()=>{const p=window.__WORLD_QA__.player;p.yaw=0;p.velocity.set(0,0,0);p.grounded=true;const before=p.position.clone();for(let i=0;i<20;i++){p.setInput({moveX:0,moveForward:1,lookX:0,lookY:0,jump:false});p.update(1/60);}return {dx:p.position.x-before.x,dz:p.position.z-before.z,body:p.bodyYaw};});
      assert(Math.abs(r.dx)<Math.abs(r.dz)+0.05,'forward movement not camera-planar');assert(r.dz<0.15,'forward basis reversed');assert(Math.abs(r.body)<0.08,'feet do not face forward travel');
    });
    await test('v3-visual-quality-systems-active',async()=>{const s=await page.evaluate(()=>window.__WORLD_QA__.getSnapshot());const ids=new Set(s.events.map(e=>e.id));assert(ids.has('baked-lighting'),'baked lighting event missing');assert(ids.has('wet-surface'),'wet-surface event missing');assert(ids.has('atmosphere'),'atmosphere event missing');});
    await test('known-error-immunity',async()=>{const s=await page.evaluate(()=>window.__WORLD_QA__.getSnapshot());assert(s.errors.length===0,`runtime errors: ${JSON.stringify(s.errors)}`)});
    const perf=await page.evaluate(()=>window.__WORLD_QA__.getSnapshot().performance);wr.performance=perf;
  }catch(e){wr.pass=false;report.pass=false;wr.fatal=e.message;report.errors.push(`${entry.id}:fatal:${e.message}`)}
  await ctx.close();
}
await browser.close();
fs.mkdirSync(path.join(ROOT,'quality/reports'),{recursive:true});
fs.writeFileSync(path.join(ROOT,'quality/reports/browser-playtest.json'),JSON.stringify(report,null,2)+'\n');
console.log(report.pass?'BROWSER PLAYTEST: PASS':'BROWSER PLAYTEST: FAIL');
if(!report.pass){for(const e of report.errors)console.error(' -',e);process.exit(1)}
