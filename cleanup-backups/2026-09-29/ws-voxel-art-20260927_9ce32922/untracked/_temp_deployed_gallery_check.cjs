const {chromium}=require('@playwright/test');
const base='https://world-server-pr-336.mmmpaykin.workers.dev';
(async()=>{const r=await fetch(base+'/api/config');const j=await r.json();console.log('CONFIG',r.status,JSON.stringify(j).slice(0,260));const b=await chromium.launch({channel:'msedge',headless:true});try{
for(const [name,viewport,mobile] of [['desktop',{width:1365,height:768},false],['mobile',{width:390,height:844},true]]){
const c=await b.newContext({viewport,isMobile:mobile,hasTouch:mobile});const p=await c.newPage();const errs=[];p.on('pageerror',e=>errs.push(e.message));const response=await p.goto(base+'/apps/voxel-art-lab/',{waitUntil:'domcontentloaded',timeout:30000});console.log(name,'HTTP',response.status());
await p.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('barren ·'),null,{timeout:40000});
for(const kind of ['city','forest','volcano','energy','idea','river']){await p.locator('button[data-kind="'+kind+'"]').click();await p.waitForFunction(k=>document.querySelector('#status')?.textContent.startsWith(k+' ·'),kind,{timeout:25000});}
console.log(name,'6 choices + barren PASS errors',errs);await c.close();}
}finally{await b.close()}})().catch(e=>{console.error('FAIL',e);process.exitCode=1;});
