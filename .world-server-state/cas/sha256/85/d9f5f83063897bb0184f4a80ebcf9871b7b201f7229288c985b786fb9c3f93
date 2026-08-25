#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),pc=cfg.progressiveRollout||{};
const cmd=process.argv[2]||'status',supa=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'',base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');
function arg(name,def=null){const p=process.argv.find(x=>x.startsWith(`--${name}=`));return p?p.slice(name.length+3):def}
function out(r,code=0){fs.writeFileSync(path.join(ROOT,'QUALITY_PROGRESSIVE_ROLLOUT_REPORT.json'),JSON.stringify(r,null,2)+'\n');console.log(`[QUALITY_ROLLOUT] ${r.status}`);if(code)process.exit(code)}
function headers(extra={}){return{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',...extra}}
async function db(method,pathName,body){const r=await fetch(`${supa}/rest/v1/${pathName}`,{method,headers:headers(method==='POST'?{prefer:'resolution=merge-duplicates,return=representation'}:{prefer:'return=representation'}),body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`Supabase ${r.status}: ${await r.text()}`);const t=await r.text();return t?JSON.parse(t):null}
async function state(){const j=await db('GET','quality_rollout_state?project_key=eq.world-server&select=*');return Array.isArray(j)?j[0]||null:j}
async function patch(values){return db('PATCH','quality_rollout_state?project_key=eq.world-server',values)}

async function recordOutcome(s,accepted,classification,payload){
  if(!s?.candidate_fingerprint)return;
  try{await db('POST','quality_autopilot_patch_outcomes',{patch_fingerprint:s.candidate_fingerprint,source_sha:s.candidate_sha||s.base_sha||null,classification,accepted:Boolean(accepted),perf_win_pct:null,error_delta_pct:null,changed_files:null,changed_lines:null,recipe_ids:[],candidate_url:s.candidate_url||null,payload:{rolloutId:s.rollout_id,stage:s.stage_percent,...payload}})}catch(e){console.warn('[QUALITY_ROLLOUT] outcome persistence failed:',String(e.message||e))}
}
async function evidence(s,decision,payload){return db('POST','quality_rollout_stage_evidence',{rollout_id:s.rollout_id,stage_percent:s.stage_percent,decision,candidate_sessions:Number(payload.candidateSessions||0),candidate_mobile_sessions:Number(payload.candidateMobileSessions||0),countries:Number(payload.countries||0),payload})}
function pctReg(candidate,baseline){if(!Number.isFinite(candidate)||!Number.isFinite(baseline)||baseline===0)return null;return (candidate-baseline)*100/baseline}
function n(v){return Number.isFinite(Number(v))?Number(v):null}
async function summary(params){const q=new URLSearchParams({hours:String(Math.min(168,Math.max(1,Number(params.hours||24))))});for(const k of ['deploymentUrl','excludeDeploymentUrl','rolloutId'])if(params[k])q.set(k,params[k]);const r=await fetch(`${base}/api/quality-summary?${q}`,{cache:'no-store',signal:AbortSignal.timeout(20000)}),j=await r.json().catch(()=>({ok:false}));if(!r.ok||j.ok!==true)throw new Error(j.error||`summary HTTP ${r.status}`);return j}
async function evaluate(s){
  const stage=String(s.stage_percent),minMin=Number(pc.minimumStageMinutes?.[stage]||10),ageMin=(Date.now()-Date.parse(s.stage_started_at||s.updated_at||s.started_at))/60000;
  if(ageMin<minMin)return{decision:'WAITING_MIN_STAGE_TIME',ageMin,minMin};
  const hours=Math.min(Number(pc.maxStageHours||24),Math.max(1,Math.ceil(ageMin/60)+1));
  const candidate=await summary({hours,deploymentUrl:s.candidate_url,rolloutId:s.rollout_id}),baseline=await summary({hours,excludeDeploymentUrl:s.candidate_url});
  const ct=candidate.totals||{},bt=baseline.totals||{},candidateSessions=Number(ct.sessions||0),candidateMobileSessions=Number(candidate.devices?.mobile?.sessions||0),minimum=Number(pc.minimumCandidateSessionsByStage?.[stage]||4),minimumMobile=Number(pc.minimumCandidateMobileSessionsByStage?.[stage]||0);
  const countries=Object.entries(candidate.countries||{}).filter(([k,v])=>k!=='unknown'&&Number(v.sessions||0)>0).length,gpuProfiles=Number(candidate.devices?.mobile?.gpuProfiles||0);
  const evidenceReady=candidateSessions>=minimum&&candidateMobileSessions>=minimumMobile&&(!pc.requireGeographicEvidence||countries>=1)&&(Number(s.stage_percent)<50||!pc.requireMobileGpuEvidenceAt50||gpuProfiles>=Math.min(5,minimumMobile||5));
  const details={candidateSessions,candidateMobileSessions,minimum,minimumMobile,countries,gpuProfiles,ageMin,hours,candidate:ct,baseline:bt};
  if(!evidenceReady)return{decision:'WAITING_RUM_EVIDENCE',...details};
  const violations=[];
  const er=(n(ct.errorRatePercent)||0)-(n(bt.errorRatePercent)||0);if(er>Number(pc.maxErrorRateDeltaPercent||0))violations.push({metric:'errorRateDeltaPercent',observed:er,max:Number(pc.maxErrorRateDeltaPercent||0)});
  for(const [metric,max] of [['p75LcpMs',pc.maxP75LcpRegressionPercent],['p75InpMs',pc.maxP75InpRegressionPercent]]){const d=pctReg(n(ct[metric]),n(bt[metric]));if(d!==null&&d>Number(max||3))violations.push({metric:`${metric}RegressionPercent`,observed:d,max:Number(max||3)})}
  const fps=pctReg(n(ct.p10Fps),n(bt.p10Fps));if(fps!==null&&fps < -Number(pc.maxP10FpsRegressionPercent||5))violations.push({metric:'p10FpsRegressionPercent',observed:fps,min:-Number(pc.maxP10FpsRegressionPercent||5)});
  const thermal=(n(ct.p75ThermalPressureProxy)||0)-(n(bt.p75ThermalPressureProxy)||0);if(thermal>Number(pc.maxThermalProxyDelta||.05))violations.push({metric:'thermalProxyDelta',observed:thermal,max:Number(pc.maxThermalProxyDelta||.05)});
  if(Number(s.stage_percent)>=50&&pc.requireVisualOracleAt50!==false){
    const cvs=Number(ct.visualSamples||0),bvs=Number(bt.visualSamples||0),vmin=Math.max(3,Number(cfg.visualOracle?.minCandidateSamplesAt50Percent||5));
    details.visualOracle={candidateSamples:cvs,baselineSamples:bvs,minimum:vmin};
    if(cvs<vmin||bvs<vmin)return{decision:'WAITING_VISUAL_ORACLE_EVIDENCE',violations,...details};
    const blankDelta=(n(ct.visualBlankRatePercent)||0)-(n(bt.visualBlankRatePercent)||0);if(blankDelta>Number(pc.maxVisualBlankRateDeltaPercent||5))violations.push({metric:'visualBlankRateDeltaPercent',observed:blankDelta,max:Number(pc.maxVisualBlankRateDeltaPercent||5)});
    for(const [metric,max] of [['p50VisualNonBlankRatio',pc.maxVisualNonBlankRegressionPercent],['p50VisualLumaStddev',pc.maxVisualLumaStddevRegressionPercent],['p50VisualEdgeDensity',pc.maxVisualEdgeDensityRegressionPercent]]){const d=pctReg(n(ct[metric]),n(bt[metric]));if(d!==null&&d<-Number(max||20))violations.push({metric:`${metric}RegressionPercent`,observed:d,min:-Number(max||20)})}
  }
  return{decision:violations.length?'REGRESSION':'PASS',violations,...details};
}
(async()=>{
  if(!supa||!key)throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  if(cmd==='begin'){
    const candidateUrl=arg('candidate-url'),candidateSha=arg('candidate-sha'),baseSha=arg('base-sha'),pr=Number(arg('pr','0'))||null,fingerprint=arg('fingerprint');if(!candidateUrl||!baseSha)throw new Error('begin requires --candidate-url and --base-sha');
    const rolloutId=crypto.randomUUID(),now=new Date().toISOString(),expires=new Date(Date.now()+Number(pc.maxStageHours||24)*4*3600000).toISOString();
    const row={project_key:'world-server',rollout_id:rolloutId,state:'active',stage_percent:1,candidate_url:candidateUrl,candidate_sha:candidateSha||null,base_sha:baseSha,pr_number:pr,candidate_fingerprint:fingerprint||null,stage_started_at:now,started_at:now,expires_at:expires,failure_reason:null,payload:{strategy:pc.strategy||'free-rum-session-routing'},updated_at:now};
    await db('POST','quality_rollout_state?on_conflict=project_key',row);return out({generatedAt:now,status:'ROLLOUT_STARTED_STAGE_1',...row});
  }
  const s=await state();if(!s)return out({generatedAt:new Date().toISOString(),status:'NO_ROLLOUT_STATE',state:null});
  if(cmd==='status')return out({generatedAt:new Date().toISOString(),status:'ROLLOUT_STATUS',state:s});
  if(cmd==='abort'){
    const reason=arg('reason','manual_or_guard_abort');await patch({state:'aborted',stage_percent:0,failure_reason:reason,updated_at:new Date().toISOString()});return out({generatedAt:new Date().toISOString(),status:'ROLLOUT_ABORTED',reason,state:{...s,state:'aborted',stage_percent:0}});
  }
  if(cmd==='complete'){
    await recordOutcome(s,true,'rum_rollout_verified',{status:'100_percent_complete'});
    await patch({state:'complete',stage_percent:100,stage_started_at:new Date().toISOString(),updated_at:new Date().toISOString()});return out({generatedAt:new Date().toISOString(),status:'ROLLOUT_COMPLETE_100',state:{...s,state:'complete',stage_percent:100}});
  }
  if(cmd!=='tick')throw new Error(`unknown command ${cmd}`);
  if(s.state==='complete'||s.state==='aborted'||s.state==='inactive')return out({generatedAt:new Date().toISOString(),status:'ROLLOUT_NOT_ACTIVE',state:s});
  if(s.state==='ready_to_promote')return out({generatedAt:new Date().toISOString(),status:'READY_TO_PROMOTE',state:s});
  if(s.expires_at&&Date.parse(s.expires_at)<Date.now()){await patch({state:'aborted',stage_percent:0,failure_reason:'rollout_expired',updated_at:new Date().toISOString()});return out({generatedAt:new Date().toISOString(),status:'ROLLOUT_ABORTED_EXPIRED',state:s},108)}
  const ev=await evaluate(s);await evidence(s,ev.decision,ev);
  if(ev.decision==='REGRESSION'){await recordOutcome(s,false,'rum_rollout_regression',{violations:ev.violations});await patch({state:'aborted',stage_percent:0,failure_reason:JSON.stringify(ev.violations).slice(0,1000),updated_at:new Date().toISOString()});return out({generatedAt:new Date().toISOString(),status:'ROLLOUT_ABORTED_REGRESSION',state:s,evidence:ev},109)}
  if(ev.decision!=='PASS')return out({generatedAt:new Date().toISOString(),status:ev.decision,state:s,evidence:ev});
  if(Number(s.stage_percent)===50){await patch({state:'ready_to_promote',updated_at:new Date().toISOString()});return out({generatedAt:new Date().toISOString(),status:'READY_TO_PROMOTE',state:{...s,state:'ready_to_promote'},evidence:ev})}
  const next=Number(s.stage_percent)===1?10:50,now=new Date().toISOString();await patch({stage_percent:next,stage_started_at:now,updated_at:now});return out({generatedAt:now,status:`ROLLOUT_ADVANCED_${next}`,state:{...s,stage_percent:next,stage_started_at:now},evidence:ev});
})().catch(e=>{out({generatedAt:new Date().toISOString(),status:'ROLLOUT_ERROR',error:String(e.message||e)},110)});
