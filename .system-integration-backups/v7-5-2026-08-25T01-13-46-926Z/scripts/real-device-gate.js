#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),url=process.env.REAL_DEVICE_PROVIDER_URL,token=process.env.REAL_DEVICE_PROVIDER_TOKEN;
if(!url||!token){
  const report={generatedAt:new Date().toISOString(),status:'NOT_CONFIGURED',pass:false,reason:'REAL_DEVICE_PROVIDER_URL/TOKEN missing'};
  fs.writeFileSync(path.join(ROOT,'REAL_DEVICE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log('[REAL_DEVICE_GATE] NOT_CONFIGURED');
  process.exit(process.env.REAL_DEVICE_STRICT==='1'?21:0);
}
const payload={baseUrl:process.env.QUALITY_BASE_URL||'http://localhost:3000',suite:'world-server-golden',devices:['physical-ios-phone','physical-android-phone']};
const r=await fetch(url,{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(120000)});
const j=await r.json().catch(()=>({}));
const pass=r.ok&&j.pass===true;
fs.writeFileSync(path.join(ROOT,'REAL_DEVICE_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:r.status,pass,result:j},null,2)+'\n');
if(!pass)process.exit(21);
console.log('[REAL_DEVICE_GATE] PASS');
