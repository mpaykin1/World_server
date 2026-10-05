import{chromium}from'playwright';

const url=process.env.KK_URL||'http://127.0.0.1:8765/kkrieger.html';
const browser=await chromium.launch({headless:true,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
try{
  const page=await browser.newPage({viewport:{width:1280,height:800}});
  const errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.goto(url,{waitUntil:'domcontentloaded',timeout:120000});
  const before=await page.evaluate(()=>{
    const c=document.querySelector('canvas'),start=document.getElementById('start');
    if(!c||!start)return null;
    const r=c.getBoundingClientRect(),vw=innerWidth,vh=innerHeight;
    const w=Math.max(0,Math.min(r.right,vw)-Math.max(r.left,0));
    const h=Math.max(0,Math.min(r.bottom,vh)-Math.max(r.top,0));
    return{coverage:(w*h)/(vw*vh),webgl2:!!c.getContext('webgl2')};
  });
  if(!before)throw new Error('missing Krieger start UI/canvas');
  if(!before.webgl2)throw new Error('WebGL2 unavailable');
  if(before.coverage<.85)throw new Error(`canvas visibility below 85%: ${before.coverage}`);
  await page.locator('#start').click({timeout:30000});
  await page.waitForFunction(()=>!document.getElementById('start'),null,{timeout:30000});
  await page.waitForFunction(()=>Array.isArray(window.__kkLog)&&(window.__kkLog.some(x=>/KDoc::Init|frame|paint|engine|intro|menu|game/i.test(String(x)))),null,{timeout:90000});
  const logTail=await page.evaluate(()=>(window.__kkLog||[]).slice(-80));
  const significant=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  console.log(JSON.stringify({pass:significant.length===0,url,userVisibilityPercent:Math.round(before.coverage*1000)/10,webgl2:before.webgl2,logTail:logTail.slice(-20),errors:significant.slice(0,20)},null,2));
  if(significant.length)throw new Error(`runtime errors: ${significant.join(' | ')}`);
}finally{await browser.close();}
