import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';

const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:8000/';
const update=process.env.UPDATE_VISUAL_BASELINES==='1';
const config=JSON.parse(fs.readFileSync(path.join(ROOT,'quality/baselines/global.json'),'utf8')).visualRegression;
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'worlds/registry.json'),'utf8'));
const goldDir=path.join(ROOT,'quality/baselines/visual');const curDir=path.join(ROOT,'quality/reports/visual-current');
fs.mkdirSync(goldDir,{recursive:true});fs.mkdirSync(curDir,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
const report={schemaVersion:2,pass:true,worlds:[],errors:[]};
for(const w of registry.worlds.filter(x=>x.enabled!==false)){
 const ctx=await browser.newContext({viewport:{width:1440,height:810},deviceScaleFactor:1});const page=await ctx.newPage();
 const current=path.join(curDir,`${w.id}.png`),gold=path.join(goldDir,`${w.id}.png`);const wr={id:w.id,pass:true};report.worlds.push(wr);
 try{
  await page.goto(`${base}?world=${encodeURIComponent(w.id)}&qa=1`,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>window.__WORLD_QA__?.getSnapshot,{timeout:120000});await page.waitForTimeout(2200);
  await page.evaluate(()=>{const p=window.__WORLD_QA__.player;p.yaw=0;p.pitch=0;p.velocity.set(0,0,0);p.update(1/60)});await page.waitForTimeout(120);
  await page.screenshot({path:current});
  if(update||!fs.existsSync(gold)){if(update){fs.copyFileSync(current,gold);wr.updated=true;continue;}throw new Error(`visual baseline missing: ${gold}; create only after approval with UPDATE_VISUAL_BASELINES=1`)}
  const a=PNG.sync.read(fs.readFileSync(gold)),b=PNG.sync.read(fs.readFileSync(current));if(a.width!==b.width||a.height!==b.height)throw new Error(`viewport mismatch ${a.width}x${a.height} vs ${b.width}x${b.height}`);
  const diff=new PNG({width:a.width,height:a.height});const changed=pixelmatch(a.data,b.data,diff.data,a.width,a.height,{threshold:0.10,includeAA:false});const ratio=changed/(a.width*a.height);
  let sum=0;for(let i=0;i<a.data.length;i+=4){sum+=Math.abs(a.data[i]-b.data[i])+Math.abs(a.data[i+1]-b.data[i+1])+Math.abs(a.data[i+2]-b.data[i+2]);}const mean=sum/(a.width*a.height*3);
  wr.changedPixelRatio=ratio;wr.meanChannelDelta=mean;
  if(ratio>config.maxChangedPixelRatio||mean>config.maxMeanChannelDelta)throw new Error(`GFX-002 regression ratio=${ratio.toFixed(4)} meanDelta=${mean.toFixed(2)}`);
 }catch(e){wr.pass=false;wr.error=e.message;report.pass=false;report.errors.push(`${w.id}:${e.message}`)}
 await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(ROOT,'quality/reports/visual-regression.json'),JSON.stringify(report,null,2)+'\n');
console.log(report.pass?'VISUAL REGRESSION: PASS':'VISUAL REGRESSION: FAIL');if(!report.pass){for(const e of report.errors)console.error(' -',e);process.exit(1)}
