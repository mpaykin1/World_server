#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),rum=cfg.rum||{},th=rum.thresholds||{};
const base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
function n(v){return Number.isFinite(Number(v))?Number(v):null}
(async()=>{
  const r=await fetch(`${base}/api/quality-summary?hours=${Number(rum.windowHours||24)}`,{cache:'no-store',signal:AbortSignal.timeout(20000)}),j=await r.json().catch(()=>({ok:false}));if(!r.ok||j.ok!==true)throw new Error(j.error||`HTTP ${r.status}`);
  const m=j.devices?.mobile||{},profiles=Number(m.gpuProfiles||0),minimum=Number(rum.minGpuProfileSessionsForHardGate||5),violations=[];
  if(profiles>=minimum){
    const thermal=n(m.p75ThermalPressureProxy);if(thermal!==null&&thermal>Number(th.maxThermalPressureProxy||.35))violations.push({metric:'p75ThermalPressureProxy',observed:thermal,max:Number(th.maxThermalPressureProxy||.35)});
    const long=n(m.p75LongTaskRatio);if(long!==null&&long>Number(th.maxLongTaskRatio||.2))violations.push({metric:'p75LongTaskRatio',observed:long,max:Number(th.maxLongTaskRatio||.2)});
    const sustained=n(m.p10SustainedFps);if(sustained!==null&&sustained<Number(th.minSustainedFps||24))violations.push({metric:'p10SustainedFps',observed:sustained,min:Number(th.minSustainedFps||24)});
  }
  const enough=profiles>=minimum,report={generatedAt:new Date().toISOString(),status:!enough?'INSUFFICIENT_REAL_DEVICE_GPU_SAMPLES':violations.length?'MOBILE_GPU_THERMAL_REGRESSION':'MOBILE_GPU_HEALTHY',pass:!enough||violations.length===0,enoughEvidence:enough,profiles,minimum,mobile:m,violations,thermalMeasurement:'performance-pressure proxy, not physical temperature',rawGpuRendererCollected:false};
  fs.writeFileSync(path.join(ROOT,'QUALITY_MOBILE_GPU_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[QUALITY_MOBILE_GPU] ${report.status} profiles=${profiles} violations=${violations.length}`);if(enough&&violations.length)process.exit(103);
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_MOBILE_GPU_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'GPU_GATE_UNAVAILABLE',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(102)});
