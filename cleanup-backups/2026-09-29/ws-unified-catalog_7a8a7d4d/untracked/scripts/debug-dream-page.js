'use strict';
const {spawn}=require('child_process');
const {chromium}=require('@playwright/test');
const path=require('path');
const root=path.resolve(__dirname,'..');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const server=spawn(process.execPath,['server.js'],{cwd:root,env:{...process.env,PORT:'3197'},stdio:'ignore'});
 await sleep(1500); const browser=await chromium.launch({headless:true}); const page=await browser.newPage();
 page.on('pageerror',e=>console.log('PAGEERROR',e.stack||e.message));
 page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
 try{await page.goto('http://127.0.0.1:3197/apps/dreamfog-world/',{waitUntil:'domcontentloaded'});await sleep(2500);console.log('RUNTIME',await page.evaluate(()=>({p:window.GamePlayableRuntime?.stats?.(),d:window.__DREAMFOG_STATE__})));}
 finally{await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1});