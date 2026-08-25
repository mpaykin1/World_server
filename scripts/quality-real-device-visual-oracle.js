#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {fetchJson}=require('../lib/quality-resilient-fetch');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),vc=cfg.visualOracle||{},base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
function n(v){return Number.isFinite(Number(v))?Number(v):null}
function reg(c,b){if(c===null||b===null||b===0)return null;return(c-b)*100/b}
async function summary(params={}){const q=new URLSearchParams({hours:String(Number(params.hours||24))});for(const k of ['deploymentUrl','excludeDeploymentUrl','rolloutId'])if(params[k])q.set(k,params[k]);const {response,json}=await fetchJson(`${base}/api/quality-summary?${q}`,{cache:'no-store',timeoutMs:15000,retries:2});if(!response.ok||json.ok!==true)throw new Error(json.error||`HTTP ${response.status}`);return json}
function score(t){
  let s=100;const blank=n(t.visualBlankRatePercent),non=n(t.p50VisualNonBlankRatio),std=n(t.p50VisualLumaStddev),edge=n(t.p50VisualEdgeDensity);
  if(blank!==null)s-=Math.min(60,blank*2);
  if(non!==null&&non<.15)s-=Math.min(30,(.15-non)*150);
  if(std!==null&&std<.03)s-=15;
  if(edge!==null&&edge<.01)s-=15;
  return Math.max(0,Math.round(s*100)/100);
}
(async()=>{
  const candidate=process.env.CANDIDATE_URL||'',rolloutId=process.env.ROLLOUT_ID||'';
  const overall=await summary({hours:24,rolloutId:rolloutId||undefined});
  const t=overall.totals||{},samples=Number(t.visualSamples||0),min=Number(vc.minSamplesForHardGate||6),violations=[];
  if(samples>=min&&n(t.visualBlankRatePercent)>Number(vc.maxBlankRatePercent||12))violations.push({metric:'visualBlankRatePercent',observed:n(t.visualBlankRatePercent),max:Number(vc.maxBlankRatePercent||12)});
  let comparison=null;
  if(candidate){
    const c=(await summary({hours:24,deploymentUrl:candidate,rolloutId:rolloutId||undefined})).totals||{};
    const b=(await summary({hours:24,excludeDeploymentUrl:candidate})).totals||{};
    const cs=Number(c.visualSamples||0),bs=Number(b.visualSamples||0),hard=cs>=min&&bs>=min;
    const blankDelta=(n(c.visualBlankRatePercent)||0)-(n(b.visualBlankRatePercent)||0);
    const nonReg=reg(n(c.p50VisualNonBlankRatio),n(b.p50VisualNonBlankRatio));
    const stdReg=reg(n(c.p50VisualLumaStddev),n(b.p50VisualLumaStddev));
    const edgeReg=reg(n(c.p50VisualEdgeDensity),n(b.p50VisualEdgeDensity));
    if(hard&&blankDelta>Number(vc.maxBlankRateDeltaPercent||5))violations.push({metric:'candidateBlankRateDelta',observed:blankDelta,max:Number(vc.maxBlankRateDeltaPercent||5)});
    if(hard&&nonReg!==null&&nonReg<-Number(vc.maxNonBlankRegressionPercent||20))violations.push({metric:'candidateNonBlankRegressionPercent',observed:nonReg,min:-Number(vc.maxNonBlankRegressionPercent||20)});
    if(hard&&stdReg!==null&&stdReg<-Number(vc.maxLumaStddevRegressionPercent||35))violations.push({metric:'candidateLumaStddevRegressionPercent',observed:stdReg,min:-Number(vc.maxLumaStddevRegressionPercent||35)});
    if(hard&&edgeReg!==null&&edgeReg<-Number(vc.maxEdgeDensityRegressionPercent||35))violations.push({metric:'candidateEdgeDensityRegressionPercent',observed:edgeReg,min:-Number(vc.maxEdgeDensityRegressionPercent||35)});
    comparison={candidateSamples:cs,baselineSamples:bs,hardGate:hard,candidate:c,baseline:b,blankDelta,nonBlankRegressionPercent:nonReg,lumaStddevRegressionPercent:stdReg,edgeDensityRegressionPercent:edgeReg};
  }
  const pass=violations.length===0,status=samples<min?'GATHERING_REAL_DEVICE_VISUAL_EVIDENCE':(pass?'REAL_DEVICE_VISUAL_ORACLE_PASS':'REAL_DEVICE_VISUAL_ORACLE_FAIL');
  const report={generatedAt:new Date().toISOString(),status,pass,samples,minimumSamples:min,privacy:vc.privacy||'derived-metrics-only',score:score(t),totals:t,comparison,violations};
  fs.writeFileSync(path.join(ROOT,'QUALITY_REAL_DEVICE_VISUAL_ORACLE.json'),JSON.stringify(report,null,2)+'\n');
  if(process.env.SUPABASE_URL&&process.env.SUPABASE_SERVICE_ROLE_KEY&&candidate&&comparison){
    try{await fetch(`${process.env.SUPABASE_URL.replace(/\/$/,'')}/rest/v1/quality_visual_oracle_results`,{method:'POST',headers:{apikey:process.env.SUPABASE_SERVICE_ROLE_KEY,authorization:`Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,'content-type':'application/json',prefer:'return=minimal'},body:JSON.stringify({project_id:'world-server',release_id:rolloutId||candidate,baseline_score:score(comparison.baseline),candidate_score:score(comparison.candidate),decision:pass?'pass':'fail',evidence:{comparison,violations,privacy:vc.privacy}}),signal:AbortSignal.timeout(12000)})}catch(_){}
  }
  console.log(`[QUALITY_VISUAL_ORACLE] ${status} samples=${samples} score=${report.score}`);if(!pass)process.exit(121);
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_REAL_DEVICE_VISUAL_ORACLE.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'VISUAL_ORACLE_CHECK_FAILED',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(122)});
