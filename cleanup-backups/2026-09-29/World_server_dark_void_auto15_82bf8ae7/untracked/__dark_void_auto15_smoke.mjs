import{chromium,webkit}from'file:///C:/Users/user/Desktop/World_server_dark_void_v4/node_modules/playwright/index.mjs';
for(const [name,type,viewport] of [['desktop',chromium,{width:1440,height:900}],['mobile',webkit,{width:390,height:844}]]){
 const browser=await type.launch({headless:true});const page=await browser.newPage({viewport});const errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
 await page.goto('http://127.0.0.1:50187/',{waitUntil:'networkidle',timeout:30000});
 await page.waitForFunction(()=>window.DarkVoidSceneRuntime&&document.querySelector('#navigatorDialog'),null,{timeout:20000});
 for(let i=0;i<3;i++)await page.evaluate(()=>window.DarkVoidSceneRuntime.createInWorld('create a small tower'));
 const r=await page.evaluate(()=>{const x=window.DarkVoidSceneRuntime,e=JSON.parse(x.scienceEvidenceExport()),p=e.rows.find(r=>r.h==='H3'&&r.phase==='prediction');return{lang:document.documentElement.lang,noH4:!/H4|multi.?AI/i.test(document.body.innerText),journal:x.verifyRecipeJournal(),summary:x.scienceEvidenceSummary(),prediction:p,manifestation:x.manifestation.stats()}});
 const shot=await page.locator('canvas').screenshot();const pass=r.lang==='en'&&r.noH4&&r.journal&&r.summary.H1.n&&r.summary.H2.n&&r.summary.H3.n&&r.prediction?.beforeManifestation&&r.prediction?.selectionBlind&&Number.isInteger(r.prediction?.modelCommitment)&&shot.length>1000&&!errors.length;
 console.log(JSON.stringify({name,pass,canvasBytes:shot.length,errors,result:r}));await browser.close();if(!pass)process.exitCode=1;
}
