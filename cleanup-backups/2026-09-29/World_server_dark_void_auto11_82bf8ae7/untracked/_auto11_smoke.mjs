import{chromium,webkit}from'playwright';
const url='http://127.0.0.1:38477/apps/dark-void-scene/';
for(const [name,engine,viewport] of [['desktop-chromium',chromium,{width:1440,height:900}],['mobile-webkit',webkit,{width:390,height:844}]]){
 const browser=await engine.launch({headless:true});const page=await browser.newPage({viewport});const errors=[];page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});page.on('pageerror',e=>errors.push(e.message));
 const r=await page.goto(url,{waitUntil:'networkidle'});await page.waitForFunction(()=>window.DarkVoidSceneRuntime?.journey);await page.keyboard.down('KeyW');await page.waitForTimeout(120);await page.keyboard.up('KeyW');
 for(let i=0;i<6;i++)await page.evaluate(async i=>window.DarkVoidSceneRuntime.createInWorld(`create a tower seed ${i}`),i);
 const state=await page.evaluate(()=>({text:document.body.innerText,h4:/\bH4\b/i.test(document.body.innerText),journal:DarkVoidSceneRuntime.verifyRecipeJournal(),stats:DarkVoidSceneRuntime.stats(),evidence:DarkVoidSceneRuntime.scienceEvidenceSummary(),pos:DarkVoidSceneRuntime.eye.position.toArray()}));const shot=await page.screenshot();
 console.log(JSON.stringify({name,status:r.status(),bytes:shot.length,errors,state}));if(r.status()!==200||errors.length||state.h4||!state.journal||shot.length<10000)process.exitCode=1;await browser.close();
}
