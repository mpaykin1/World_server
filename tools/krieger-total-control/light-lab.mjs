#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";
import { analyzeForensics } from "./observatory-core.mjs";

const url=process.env.KK_URL || "http://127.0.0.1:8765/kkrieger.html?res=fit";
const out=process.env.KK_LIGHT_REPORT || "KRIEGER_LIGHT_LAB_REPORT.json";
const shotDir=process.env.KK_LIGHT_SHOTS || "";
const exactSha=process.env.KK_EVIDENCE_SHA || null;

function dominatesNoise(effect,noise){
  return effect.meanAbs > noise.meanAbs + 0.25 &&
    effect.changedRatio > noise.changedRatio + 0.002;
}

const browser=await chromium.launch({
  headless:true,
  args:["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--autoplay-policy=no-user-gesture-required"],
});
const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:1});
const page=await context.newPage();
const errors=[];
const screenshotErrors=[];
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",m=>{ if(m.type()==="error") errors.push(m.text()); });

async function capture(name){
  const stats=await page.evaluate((key)=>{
    const source=document.querySelector("canvas");
    if(!source) throw new Error("Krieger canvas missing");
    const width=256;
    const height=Math.max(1,Math.round(width*source.height/Math.max(source.width,1)));
    const c=document.createElement("canvas");
    c.width=width;c.height=height;
    const ctx=c.getContext("2d",{willReadFrequently:true});
    ctx.drawImage(source,0,0,width,height);
    const data=new Uint8ClampedArray(ctx.getImageData(0,0,width,height).data);
    window.__kkLightLabFrames=window.__kkLightLabFrames||{};
    window.__kkLightLabFrames[key]=data;
    let sum=0,min=255,max=0,nonBlack=0;
    for(let i=0;i<data.length;i+=4){
      const y=(data[i]+data[i+1]+data[i+2])/3;
      sum+=y;min=Math.min(min,y);max=Math.max(max,y);
      if(y>3) nonBlack++;
    }
    return {width,height,meanLuma:sum/(data.length/4),minLuma:min,maxLuma:max,nonBlackRatio:nonBlack/(data.length/4)};
  },name);
  if(shotDir){
    fs.mkdirSync(shotDir,{recursive:true});
    try {
      await page.screenshot({path:`${shotDir}/${name}.png`,timeout:8000});
    } catch(e) {
      screenshotErrors.push({name,error:String(e?.message||e)});
    }
  }
  return stats;
}

async function diff(a,b){
  return page.evaluate(({a,b})=>{
    const aa=window.__kkLightLabFrames?.[a],bb=window.__kkLightLabFrames?.[b];
    if(!aa||!bb||aa.length!==bb.length) throw new Error("missing comparable framebuffer samples");
    let changed=0,sum=0,max=0,pixels=0;
    for(let i=0;i<aa.length;i+=4){
      const d=(Math.abs(aa[i]-bb[i])+Math.abs(aa[i+1]-bb[i+1])+Math.abs(aa[i+2]-bb[i+2]))/3;
      sum+=d;max=Math.max(max,d);pixels++;
      if(d>8) changed++;
    }
    return {pixels,changed,changedRatio:changed/Math.max(pixels,1),meanAbs:sum/Math.max(pixels,1),maxAbs:max};
  },{a,b});
}

async function command(code,label){
  return page.evaluate(({code,label})=>{
    const state=Module.ccall("kkObsCommand","number",["number"],[code]);
    window.__kkForensicsPush({stage:"observatory.command",code,state,label});
    return state;
  },{code,label});
}

try{
  await page.goto(url+(url.includes("?")?"&":"?")+"lightlab=1",{waitUntil:"domcontentloaded",timeout:120000});
  await page.waitForFunction(()=>window.__kkForensics?.some(x=>x.stage==="lifecycle.runtime_initialized"),null,{timeout:60000});
  await page.locator("#start").click();
  await page.waitForFunction(()=>window.__kkForensics?.some(x=>x.stage==="renderer.frame"&&x.mode==="2004"&&Number(x.selectedLights)>0&&Number(x.shadowLights)>0&&Number(x.shadowJobs)>0),null,{timeout:90000});
  await page.waitForFunction(()=>window.__kkForensics?.some(x=>x.stage==="gpu.frame"&&Number(x.drawCalls)>0),null,{timeout:30000});
  await page.waitForTimeout(300);

  const baselineA=await capture("baseline-a");
  await page.waitForTimeout(250);
  const baselineB=await capture("baseline-b");
  const noise=await diff("baseline-a","baseline-b");

  const noShadowState=await command(6,"no-shadows");
  if(noShadowState!==1) throw new Error(`expected shadow state 1, got ${noShadowState}`);
  await page.waitForTimeout(1100);
  const noShadows=await capture("no-shadows");
  const shadowEffect=await diff("baseline-b","no-shadows");

  const noLightState=await command(6,"no-lights");
  if(noLightState!==2) throw new Error(`expected shadow/light state 2, got ${noLightState}`);
  await page.waitForTimeout(1100);
  const noLights=await capture("no-lights");
  const localLightEffect=await diff("no-shadows","no-lights");

  const restoredState=await command(6,"restore");
  if(restoredState!==0) throw new Error(`expected restored state 0, got ${restoredState}`);
  await page.waitForTimeout(1100);
  const restored=await capture("restored");

  const events=await page.evaluate(()=>window.__kkForensics.slice());
  const analysis=analyzeForensics(events);
  const filteredErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  const pass=analysis.lighting.nativeLightPathObserved &&
    analysis.lighting.nativeShadowPathObserved &&
    dominatesNoise(shadowEffect,noise) &&
    dominatesNoise(localLightEffect,noise) &&
    filteredErrors.length===0;

  const report={
    schema:"world-server.krieger-light-lab/v1",
    generatedAt:new Date().toISOString(),
    exactSha,url,pass,
    nativePath:{
      source:"MasonDye/kkrieger-wasm@3bf0ff017372e640e966c2785a4d95a998cec242",
      callFlow:["Exec_Scene_Light -> Engine_::AddLightJob","Engine_::Paint2004 -> selected EngLight[0..3]","BuildPaintJobs -> ENGU_SHADOW/ENGU_LIGHT jobs","RenderPaintJobs2004 -> shadow mask + kk04SetLight","kk04SetLight -> shader constants -> EngMesh::PaintJob -> WebGL draw"],
      control:"kkCycleShadows / Observatory command 6"
    },
    commandStates:{normal:0,noShadows:noShadowState,noLights:noLightState,restored:restoredState},
    frames:{baselineA,baselineB,noShadows,noLights,restored},
    vno:{noise,shadowEffect,localLightEffect},
    analysis:{lighting:analysis.lighting,renderer:analysis.renderer,scene:analysis.scene},
    errors:filteredErrors,
    screenshotErrors,
    acceptance:{
      shadowDominatesNoise:dominatesNoise(shadowEffect,noise),
      localLightDominatesNoise:dominatesNoise(localLightEffect,noise),
      rule:"effect.meanAbs > noise.meanAbs + 0.25 AND effect.changedRatio > noise.changedRatio + 0.002"
    }
  };
  const slash=out.lastIndexOf("/");
  if(slash>0) fs.mkdirSync(out.slice(0,slash),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  if(!pass) process.exitCode=1;
} finally {
  await context.close().catch(()=>{});
  await browser.close().catch(()=>{});
}
