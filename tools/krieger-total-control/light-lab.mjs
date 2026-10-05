#!/usr/bin/env node
import fs from "node:fs";
import { chromium } from "playwright";
import { PNG } from "pngjs";
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
const cdp=await context.newCDPSession(page);
const errors=[];
const frames=new Map();
page.on("pageerror",e=>errors.push(String(e)));
page.on("console",m=>{ if(m.type()==="error") errors.push(m.text()); });

async function capture(name){
  const clip=await page.evaluate(()=>{
    const source=document.querySelector("canvas");
    if(!source) throw new Error("Krieger canvas missing");
    const r=source.getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height,scale:1};
  });
  if(!(clip.width>0&&clip.height>0)) throw new Error("Krieger canvas has zero area");
  const shot=await cdp.send("Page.captureScreenshot",{
    format:"png",fromSurface:true,captureBeyondViewport:false,clip
  });
  const buffer=Buffer.from(shot.data,"base64");
  const png=PNG.sync.read(buffer);
  const data=Buffer.from(png.data);
  frames.set(name,{width:png.width,height:png.height,data});
  let sum=0,min=255,max=0,nonBlack=0;
  for(let i=0;i<data.length;i+=4){
    const y=(data[i]+data[i+1]+data[i+2])/3;
    sum+=y;min=Math.min(min,y);max=Math.max(max,y);
    if(y>3) nonBlack++;
  }
  if(shotDir){
    fs.mkdirSync(shotDir,{recursive:true});
    fs.writeFileSync(`${shotDir}/${name}.png`,buffer);
  }
  return{
    width:png.width,height:png.height,
    meanLuma:sum/(data.length/4),minLuma:min,maxLuma:max,
    nonBlackRatio:nonBlack/(data.length/4)
  };
}

function diff(a,b){
  const aa=frames.get(a),bb=frames.get(b);
  if(!aa||!bb||aa.width!==bb.width||aa.height!==bb.height||aa.data.length!==bb.data.length)
    throw new Error("missing comparable framebuffer samples");
  let changed=0,sum=0,max=0,pixels=0;
  for(let i=0;i<aa.data.length;i+=4){
    const d=(Math.abs(aa.data[i]-bb.data[i])+Math.abs(aa.data[i+1]-bb.data[i+1])+Math.abs(aa.data[i+2]-bb.data[i+2]))/3;
    sum+=d;max=Math.max(max,d);pixels++;
    if(d>8) changed++;
  }
  return{pixels,changed,changedRatio:changed/Math.max(pixels,1),meanAbs:sum/Math.max(pixels,1),maxAbs:max};
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
  await page.waitForTimeout(1100);
  const baselineB=await capture("baseline-b");
  const noise=diff("baseline-a","baseline-b");

  const noShadowState=await command(6,"no-shadows");
  if(noShadowState!==1) throw new Error(`expected shadow state 1, got ${noShadowState}`);
  await page.waitForTimeout(1100);
  const noShadows=await capture("no-shadows");
  const shadowEffect=diff("baseline-b","no-shadows");

  const noLightState=await command(6,"no-lights");
  if(noLightState!==2) throw new Error(`expected shadow/light state 2, got ${noLightState}`);
  await page.waitForTimeout(1100);
  const noLights=await capture("no-lights");
  const localLightEffect=diff("no-shadows","no-lights");

  const restoredState=await command(6,"restore");
  if(restoredState!==0) throw new Error(`expected restored state 0, got ${restoredState}`);
  await page.waitForTimeout(1100);
  const restored=await capture("restored");

  const events=await page.evaluate(()=>window.__kkForensics.slice());
  const analysis=analyzeForensics(events);
  const filteredErrors=errors.filter(x=>!/pointer lock|AudioContext|favicon/i.test(x));
  const pass=analysis.lighting.nativeLightPathObserved &&
    analysis.lighting.nativeShadowPathObserved &&
    baselineA.nonBlackRatio>0.05 &&
    dominatesNoise(shadowEffect,noise) &&
    dominatesNoise(localLightEffect,noise) &&
    filteredErrors.length===0;

  const report={
    schema:"world-server.krieger-light-lab/v1",
    generatedAt:new Date().toISOString(),
    exactSha,url,pass,
    framebufferSource:"Chrome DevTools Page.captureScreenshot from compositor surface, clipped to the Krieger canvas",
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
    acceptance:{
      nonBlackBaseline:baselineA.nonBlackRatio>0.05,
      shadowDominatesNoise:dominatesNoise(shadowEffect,noise),
      localLightDominatesNoise:dominatesNoise(localLightEffect,noise),
      rule:"matched 1100ms baseline interval; effect.meanAbs > noise.meanAbs + 0.25 AND effect.changedRatio > noise.changedRatio + 0.002"
    }
  };
  const slash=out.lastIndexOf("/");
  if(slash>0) fs.mkdirSync(out.slice(0,slash),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(report,null,2)+"\n");
  console.log(JSON.stringify(report,null,2));
  if(!pass) process.exitCode=1;
} finally {
  await cdp.detach().catch(()=>{});
  await context.close().catch(()=>{});
  await browser.close().catch(()=>{});
}
