#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),base=(process.env.QUALITY_BASE_URL||'https://world-server.vercel.app').replace(/\/$/,'');
const performanceConfig=JSON.parse(fs.readFileSync(path.join(ROOT,'data/performance-budgets.json'),'utf8'));
const budgets=performanceConfig.budgets,memoryBudget=performanceConfig.memory||{};
const r=await fetch(`${base}/api/quality-summary?hours=24`,{signal:AbortSignal.timeout(20000)});
const j=await r.json().catch(()=>({ok:false,error:'invalid json'}));
const violations=[],signals=[];
if(!r.ok||j.ok!==true)violations.push({type:'summary-unavailable',status:r.status,error:j.error});
for(const [app,m] of Object.entries(j.apps||{})){
  const b=budgets[app];if(!b)continue;
  if(m.sessions){
    if(Number.isFinite(m.p10Fps)&&m.p10Fps<b.minimumFps)violations.push({type:'production-fps',app,observed:m.p10Fps,min:b.minimumFps});
    if(Number.isFinite(m.p95LoadMs)&&m.p95LoadMs>b.canvasVisibleMs+2500)violations.push({type:'production-load',app,observed:m.p95LoadMs,max:b.canvasVisibleMs+2500});
    if(Number(m.errors||0)>Math.max(3,Math.ceil(m.sessions*.05)))violations.push({type:'production-errors',app,errors:m.errors,sessions:m.sessions});
  }
  if(Number.isFinite(m.p95InputLatencyMs)&&Number.isFinite(b.maxP95InputLatencyMs)&&m.p95InputLatencyMs>b.maxP95InputLatencyMs)violations.push({type:'production-input-latency',app,observed:m.p95InputLatencyMs,max:b.maxP95InputLatencyMs});
  if(Number.isFinite(m.p95FrameMs)&&Number.isFinite(b.maxP95FrameMs)&&m.p95FrameMs>b.maxP95FrameMs)violations.push({type:'production-frame-time',app,observed:m.p95FrameMs,max:b.maxP95FrameMs});
  if(Number.isFinite(m.avgAnimationJankRate)&&Number.isFinite(b.maxAnimationJankRate)&&m.avgAnimationJankRate>b.maxAnimationJankRate)violations.push({type:'production-animation-jank',app,observed:m.avgAnimationJankRate,max:b.maxAnimationJankRate});
  if(Number.isFinite(m.p95LongTaskMs)&&Number.isFinite(b.maxP95LongTaskMs)&&m.p95LongTaskMs>b.maxP95LongTaskMs)violations.push({type:'production-long-task',app,observed:m.p95LongTaskMs,max:b.maxP95LongTaskMs});
  if(Number.isFinite(m.p95StutterScore)&&Number.isFinite(b.maxP95StutterScore)&&m.p95StutterScore>b.maxP95StutterScore)violations.push({type:'production-stutter',app,observed:m.p95StutterScore,max:b.maxP95StutterScore});
  if(Number.isFinite(m.sustainedPressureP95)&&Number.isFinite(b.maxSustainedPressureP95)){
    signals.push({type:'sustained-device-pressure',app,observed:m.sustainedPressureP95,max:b.maxSustainedPressureP95});
    if(m.deviceSamples>=4&&m.sustainedPressureP95>b.maxSustainedPressureP95)violations.push({type:'production-sustained-pressure',app,observed:m.sustainedPressureP95,max:b.maxSustainedPressureP95,samples:m.deviceSamples});
  }
  if(Number.isFinite(m.animationScoreP10)&&Number.isFinite(b.minAnimationQualityScore)){
    signals.push({type:'semantic-animation-quality',app,observed:m.animationScoreP10,min:b.minAnimationQualityScore});
    if(m.animationSamples>=5&&m.animationScoreP10<b.minAnimationQualityScore)violations.push({type:'production-animation-contract',app,observed:m.animationScoreP10,min:b.minAnimationQualityScore,samples:m.animationSamples,violations:m.animationViolations});
  }
  if(Number.isFinite(m.p95JsHeapMb)&&Number.isFinite(memoryBudget.chromiumHeapMbSoft)){
    signals.push({type:'js-heap-pressure',app,observed:m.p95JsHeapMb,softMax:memoryBudget.chromiumHeapMbSoft});
    if(m.deviceSamples>=4&&m.p95JsHeapMb>memoryBudget.chromiumHeapMbSoft)violations.push({type:'production-js-heap',app,observed:m.p95JsHeapMb,max:memoryBudget.chromiumHeapMbSoft,samples:m.deviceSamples});
  }
  if(Number(m.webglContextLosses||0)>=2)violations.push({type:'production-webgl-context-loss',app,observed:m.webglContextLosses});
}
const report={generatedAt:new Date().toISOString(),base,summary:j,signals,violations,pass:violations.length===0};
fs.writeFileSync(path.join(ROOT,'PRODUCTION_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[PRODUCTION_QUALITY] pass=${report.pass} violations=${violations.length} signals=${signals.length}`);
if(!report.pass)process.exit(23);
