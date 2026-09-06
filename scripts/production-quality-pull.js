#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');

async function main(){
  const ROOT=process.cwd(),base=(process.env.QUALITY_BASE_URL||'https://world-server.vercel.app').replace(/\/$/,'');
  const budgets=JSON.parse(fs.readFileSync(path.join(ROOT,'data/performance-budgets.json'),'utf8')).budgets;
  const r=await fetch(`${base}/api/quality-summary?hours=24`,{signal:AbortSignal.timeout(20000)});
  const j=await r.json().catch(()=>({ok:false,error:'invalid json'}));
  const violations=[];
  if(!r.ok||j.ok!==true)violations.push({type:'summary-unavailable',status:r.status,error:j.error});
  for(const [app,m] of Object.entries(j.apps||{})){
    const b=budgets[app];if(!b||!m.sessions)continue;
    if(Number.isFinite(m.p10Fps)&&m.p10Fps<b.minimumFps)violations.push({type:'production-fps',app,observed:m.p10Fps,min:b.minimumFps});
    if(Number.isFinite(m.p95LoadMs)&&m.p95LoadMs>b.canvasVisibleMs+2500)violations.push({type:'production-load',app,observed:m.p95LoadMs,max:b.canvasVisibleMs+2500});
    if(Number(m.errors||0)>Math.max(3,Math.ceil(m.sessions*.05)))violations.push({type:'production-errors',app,errors:m.errors,sessions:m.sessions});
  }
  const report={generatedAt:new Date().toISOString(),base,summary:j,violations,pass:violations.length===0};
  fs.writeFileSync(path.join(ROOT,'PRODUCTION_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`[PRODUCTION_QUALITY] pass=${report.pass} violations=${violations.length}`);
  if(!report.pass)process.exitCode=23;
}

main().catch((error)=>{console.error('[PRODUCTION_QUALITY] fatal:',error);process.exitCode=1;});
