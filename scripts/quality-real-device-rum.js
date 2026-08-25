#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8'));
const rum=cfg.rum||{};
const base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
if(!base){console.error('[QUALITY_RUM] QUALITY_BASE_URL required');process.exit(2)}
function finite(v){return Number.isFinite(Number(v))?Number(v):null}
function checkMetric(violations,scope,name,value,max){if(finite(value)!==null&&finite(value)>Number(max))violations.push({scope,metric:name,observed:finite(value),max:Number(max)})}
(async()=>{
  const r=await fetch(`${base}/api/quality-summary?hours=${Number(rum.windowHours||24)}`,{cache:'no-store',signal:AbortSignal.timeout(20000)});
  const data=await r.json().catch(()=>({ok:false,error:'invalid json'}));
  if(!r.ok||data.ok!==true){const report={generatedAt:new Date().toISOString(),base,available:false,pass:false,error:data.error||`HTTP ${r.status}`};fs.writeFileSync(path.join(ROOT,'QUALITY_REAL_DEVICE_RUM_REPORT.json'),JSON.stringify(report,null,2)+'\n');process.exit(61)}
  const thresholds=rum.thresholds||{},violations=[];
  let sessions=0,mobileSessions=0;
  for(const a of Object.values(data.apps||{})){sessions+=Number(a.sessions||0);mobileSessions+=Number(a.mobileSessions||0)}
  const enough=sessions>=Number(rum.minSessionsForHardGate||20);
  const enoughMobile=mobileSessions>=Number(rum.minMobileSessionsForHardGate||8);
  if(enough){
    for(const [app,a] of Object.entries(data.apps||{})){
      if(Number(a.sessions||0)<Math.max(3,Math.floor(Number(rum.minSessionsForHardGate||20)/4)))continue;
      checkMetric(violations,app,'p75LcpMs',a.p75LcpMs,thresholds.p75LcpMs||2500);
      checkMetric(violations,app,'p75InpMs',a.p75InpMs,thresholds.p75InpMs||200);
      checkMetric(violations,app,'p75Cls',a.p75Cls,thresholds.p75Cls||0.1);
      checkMetric(violations,app,'p75TtfbMs',a.p75TtfbMs,thresholds.p75TtfbMs||800);
      const fps=finite(a.p10Fps);if(fps!==null&&fps<Number(thresholds.p10Fps||30))violations.push({scope:app,metric:'p10Fps',observed:fps,min:Number(thresholds.p10Fps||30)});
      const er=finite(a.errorRatePercent);if(er!==null&&er>Number(thresholds.maxErrorRatePercent||5))violations.push({scope:app,metric:'errorRatePercent',observed:er,max:Number(thresholds.maxErrorRatePercent||5)});
    }
  }
  if(enoughMobile){
    const m=data.devices?.mobile||{};
    checkMetric(violations,'mobile','p75LcpMs',m.p75LcpMs,thresholds.p75LcpMs||2500);
    checkMetric(violations,'mobile','p75InpMs',m.p75InpMs,thresholds.p75InpMs||200);
    checkMetric(violations,'mobile','p75Cls',m.p75Cls,thresholds.p75Cls||0.1);
  }
  const report={generatedAt:new Date().toISOString(),base,available:true,rumVersion:data.rumVersion||1,sessions,mobileSessions,enoughEvidence:enough,enoughMobileEvidence:enoughMobile,violations,pass:violations.length===0,status:!enough?'INSUFFICIENT_RUM_SAMPLES':(violations.length?'RUM_REGRESSION':'RUM_HEALTHY'),summary:data};
  fs.writeFileSync(path.join(ROOT,'QUALITY_REAL_DEVICE_RUM_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`[QUALITY_RUM] status=${report.status} sessions=${sessions} mobile=${mobileSessions} violations=${violations.length}`);
  if(enough&&violations.length)process.exit(62);
})().catch(e=>{console.error(e);process.exit(63)});
