#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');
const ROOT=process.cwd();const base=(process.env.QUALITY_BASE_URL||'https://world-server.vercel.app').replace(/\/$/,'');const strict=process.env.QUALITY_REQUIRE_REAL_IOS==='1'||process.argv.includes('--strict');
const minSessions=Math.max(1,Number(process.env.QUALITY_MIN_IOS_SESSIONS||3));
async function main(){
  const r=await fetch(`${base}/api/quality-summary?hours=168`,{signal:AbortSignal.timeout(20000)});const j=await r.json().catch(()=>({ok:false}));
  const apps={};let total=0,totalStandalone=0;const violations=[];
  if(!r.ok||j.ok!==true)violations.push({type:'summary-unavailable',status:r.status});
  for(const [app,m] of Object.entries(j.apps||{})){
    const ios=Number(m.iosSessions||0),standalone=Number(m.standaloneSamples||0);total+=ios;totalStandalone+=standalone;apps[app]={iosSessions:ios,standaloneSamples:standalone,p95FrameMs:m.p95FrameMs??null,p95InputLatencyMs:m.p95InputLatencyMs??null,p95StutterScore:m.p95StutterScore??null,webglContextLosses:m.webglContextLosses??0};
    if(ios>0&&Number.isFinite(m.p95FrameMs)&&m.p95FrameMs>65)violations.push({type:'ios-frame',app,value:m.p95FrameMs,max:65});
    if(ios>0&&Number.isFinite(m.p95InputLatencyMs)&&m.p95InputLatencyMs>180)violations.push({type:'ios-input',app,value:m.p95InputLatencyMs,max:180});
    if(ios>0&&Number.isFinite(m.p95StutterScore)&&m.p95StutterScore>.72)violations.push({type:'ios-stutter',app,value:m.p95StutterScore,max:.72});
    if(ios>0&&Number(m.webglContextLosses||0)>2)violations.push({type:'ios-webgl-loss',app,value:m.webglContextLosses,max:2});
  }
  const evidence=total>=minSessions;const standaloneEvidence=totalStandalone>0;const pass=violations.length===0&&(!strict||evidence);const report={schemaVersion:'4.0.0',base,strict,minSessions,totalIosSamples:total,totalStandaloneSamples:totalStandalone,evidence,standaloneEvidence,status:evidence?(standaloneEvidence?'REAL_IOS_PWA_EVIDENCE':'REAL_IOS_BROWSER_EVIDENCE'):'NO_REAL_IOS_EVIDENCE',apps,violations,pass};
  fs.writeFileSync(path.join(ROOT,'REAL_IOS_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`[REAL_IOS_GATE] status=${report.status} samples=${total} violations=${violations.length} strict=${strict} pass=${pass}`);if(!pass)process.exit(87);
}
main().catch(e=>{console.error(e);process.exit(87)});
