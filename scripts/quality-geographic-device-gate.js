#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),rum=cfg.rum||{};
const base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
(async()=>{
  const r=await fetch(`${base}/api/quality-summary?hours=${Number(rum.windowHours||24)}`,{cache:'no-store',signal:AbortSignal.timeout(20000)}),j=await r.json().catch(()=>({ok:false}));
  if(!r.ok||j.ok!==true)throw new Error(j.error||`HTTP ${r.status}`);
  const minCountries=Number(rum.geoMinimumCountriesForEvidence||1),minPer=Number(rum.geoMinimumSessionsPerCountry||3);
  const eligible=Object.entries(j.countries||{}).filter(([k,v])=>k!=='unknown'&&Number(v.sessions||0)>=minPer).map(([country,v])=>({country,sessions:Number(v.sessions||0),mobileSessions:Number(v.mobileSessions||0),p75LcpMs:v.p75LcpMs,p75ThermalPressureProxy:v.p75ThermalPressureProxy}));
  const mobile=Number(j.devices?.mobile?.sessions||0),desktop=Number(j.devices?.desktop?.sessions||0),tablet=Number(j.devices?.tablet?.sessions||0);
  const evidenceReady=eligible.length>=minCountries;
  const report={generatedAt:new Date().toISOString(),status:evidenceReady?'GEO_DEVICE_EVIDENCE_READY':'INSUFFICIENT_REAL_USER_GEO',pass:true,evidenceReady,eligibleCountries:eligible,deviceSessions:{mobile,tablet,desktop},privacy:'country+region only; no IP/city/raw GPU renderer'};
  fs.writeFileSync(path.join(ROOT,'QUALITY_GEOGRAPHIC_DEVICE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`[QUALITY_GEO_DEVICE] ${report.status} countries=${eligible.length} mobile=${mobile} desktop=${desktop}`);
})().catch(e=>{const report={generatedAt:new Date().toISOString(),status:'GEO_DEVICE_GATE_UNAVAILABLE',pass:false,error:String(e.message||e)};fs.writeFileSync(path.join(ROOT,'QUALITY_GEOGRAPHIC_DEVICE_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.error(e);process.exit(101)});
