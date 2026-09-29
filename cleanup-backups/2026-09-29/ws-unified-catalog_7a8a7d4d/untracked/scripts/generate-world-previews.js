'use strict';
const fs=require('fs');
const path=require('path');
const {spawn}=require('child_process');
const {chromium}=require('@playwright/test');
const root=path.resolve(__dirname,'..');
const registry=require(path.join(root,'data','app-release-registry.json'));
const outDir=path.join(root,'shared','world-previews');
const tmpDir=path.join(root,'state','world-preview-video');
fs.mkdirSync(outDir,{recursive:true});fs.mkdirSync(tmpDir,{recursive:true});
const graphical=new Set(['game','navigator','experience']);
const worlds=Object.entries(registry.apps).filter(([id,m])=>graphical.has(m.kind)&&fs.existsSync(path.join(root,'apps',id,'index.html'))).map(([id,m])=>({id,title:m.title||id,url:`http://127.0.0.1:3199/apps/${id}/`}));
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function record(browser,w){
  const context=await browser.newContext({viewport:{width:480,height:270},recordVideo:{dir:tmpDir,size:{width:320,height:180}}});
  const page=await context.newPage();const video=page.video();
  try{
    const r=await page.goto(w.url,{waitUntil:'commit',timeout:15000});if(!r||r.status()>=500)throw new Error(`HTTP ${r?.status()}`);
    await sleep(1800);await page.mouse.click(240,135).catch(()=>{});await page.keyboard.down('KeyW').catch(()=>{});await sleep(900);await page.keyboard.up('KeyW').catch(()=>{});await sleep(1200);
    await page.screenshot({path:path.join(outDir,`${w.id}.jpg`),type:'jpeg',quality:48});
    await page.close();await video.saveAs(path.join(outDir,`${w.id}.webm`));
    return {id:w.id,ok:true};
  }catch(e){await page.close().catch(()=>{});return{id:w.id,ok:false,error:String(e.message||e)};}finally{await context.close().catch(()=>{});}
}
async function main(){
  const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3199'},stdio:['ignore','pipe','pipe']});
  await sleep(1600);const browser=await chromium.launch({headless:true});const results=[];
  try{for(const w of worlds){process.stdout.write(`[world-preview] ${w.id} ... `);const result=await record(browser,w);results.push(result);console.log(result.ok?'PASS':`FAIL ${result.error}`);}}
  finally{await browser.close().catch(()=>{});server.kill();}
  const report={generatedAt:new Date().toISOString(),width:320,height:180,secondsApprox:4,worlds:results};
  fs.writeFileSync(path.join(outDir,'manifest.json'),JSON.stringify(report,null,2));
  if(results.some(x=>!x.ok))process.exitCode=2;
}
main().catch(e=>{console.error(e);process.exitCode=1;});
