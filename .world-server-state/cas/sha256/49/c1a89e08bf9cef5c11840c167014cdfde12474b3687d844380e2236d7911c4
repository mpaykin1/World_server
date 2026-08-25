import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
const ROOT=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const base=process.env.WORLD_BASE_URL||'http://127.0.0.1:8000/';
const registry=JSON.parse(fs.readFileSync(path.join(ROOT,'worlds/registry.json'),'utf8'));
const known=JSON.parse(fs.readFileSync(path.join(ROOT,'quality/replays/known.json'),'utf8')).seeds||[];
const defaultSeeds=[101,202,303,404,505,606,707,808,909,1001];
const seeds=[...new Set([...known.map(x=>typeof x==='number'?x:x.seed),...defaultSeeds])];
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader']});
const report={schemaVersion:2,pass:true,failures:[],runs:[]};
for(const world of registry.worlds.filter(w=>w.enabled!==false)){
 const ctx=await browser.newContext({viewport:{width:960,height:540}});const page=await ctx.newPage();
 await page.goto(`${base}?world=${encodeURIComponent(world.id)}&qa=1`,{waitUntil:'domcontentloaded',timeout:120000});await page.waitForFunction(()=>window.__WORLD_QA__?.player,{timeout:120000});
 for(const seed of seeds){
  const r=await page.evaluate(({seed})=>{
   const p=window.__WORLD_QA__.player;let x=seed>>>0;const rnd=()=>{x=(1664525*x+1013904223)>>>0;return x/4294967296};
   p.reset();p.yaw=0;p.pitch=0;let maxRoll=0,maxPitch=0,invalid=false,penetration=false;
   for(let i=0;i<720;i++){
    const lookX=(rnd()-.5)*18,lookY=(rnd()-.5)*12;
    const moveX=rnd()<.35?0:(rnd()*2-1),moveForward=rnd()<.25?0:(rnd()*2-1),jump=rnd()<.025;
    p.setInput({moveX,moveForward,lookX,lookY,jump});p.update(1/60);
    maxRoll=Math.max(maxRoll,Math.abs(p.camera.rotation.z));maxPitch=Math.max(maxPitch,Math.abs(p.pitch));
    if(!Number.isFinite(p.position.x+p.position.y+p.position.z+p.velocity.x+p.velocity.y+p.velocity.z)){invalid=true;break;}
    if(i%30===0 && p._capsuleFreeAt && !p._capsuleFreeAt(p.position,0.005)){penetration=true;break;}
   }
   return{invalid,penetration,maxRoll,maxPitch,errors:window.__WORLD_QA__.getSnapshot().errors};
  },{seed});
  const pass=!r.invalid&&!r.penetration&&r.maxRoll<1e-9&&r.maxPitch<=89*Math.PI/180+1e-6&&r.errors.length===0;
  report.runs.push({world:world.id,seed,pass,...r});if(!pass){report.pass=false;report.failures.push({world:world.id,seed,...r});}
 }
 await ctx.close();
}
await browser.close();fs.writeFileSync(path.join(ROOT,'quality/reports/fuzz-playtest.json'),JSON.stringify(report,null,2)+'\n');
console.log(report.pass?'FUZZ PLAYTEST: PASS':'FUZZ PLAYTEST: FAIL');if(!report.pass)process.exit(1);
