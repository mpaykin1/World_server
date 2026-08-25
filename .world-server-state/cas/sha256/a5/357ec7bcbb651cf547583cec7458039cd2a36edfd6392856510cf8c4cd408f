#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {fetchJson}=require('../lib/quality-resilient-fetch');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),tc=cfg.traceOptimizer||{},supa=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
function pct(a,p){const x=a.filter(Number.isFinite).sort((m,n)=>m-n);return x.length?x[Math.min(x.length-1,Math.max(0,Math.ceil(x.length*p)-1))]:null}
(async()=>{
  if(!supa||!key){const r={generatedAt:new Date().toISOString(),status:'TRACE_OPTIMIZER_SKIPPED_NO_SUPABASE',pass:true,actions:[]};fs.writeFileSync(path.join(ROOT,'QUALITY_TRACE_OPTIMIZER_REPORT.json'),JSON.stringify(r,null,2)+'\n');console.log('[QUALITY_TRACE_OPTIMIZER] no Supabase secrets');return}
  const since=new Date(Date.now()-Number(tc.windowHours||24)*3600000).toISOString(),url=`${supa}/rest/v1/quality_trace_spans?select=trace_id,service_name,operation,duration_ms,status,attributes,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=${Number(tc.maxRows||8000)}`;
  const {response,json}=await fetchJson(url,{headers:{apikey:key,authorization:`Bearer ${key}`},timeoutMs:20000,retries:2});if(!response.ok)throw new Error(`Supabase ${response.status}`);
  const rows=Array.isArray(json)?json:[],groups=new Map();let total=0;
  for(const r of rows){const d=Number(r.duration_ms);if(!Number.isFinite(d))continue;total+=d;const k=`${r.service_name}::${r.operation}`,g=groups.get(k)||{service:r.service_name,operation:r.operation,durations:[],errors:0,totalMs:0,traces:new Set()};g.durations.push(d);g.totalMs+=d;if(r.status==='ERROR')g.errors++;g.traces.add(r.trace_id);groups.set(k,g)}
  const min=Number(tc.minimumSamplesPerOperation||3),actions=[];
  for(const g of groups.values()){if(g.durations.length<min)continue;const p95=pct(g.durations,.95),contrib=total?g.totalMs*100/total:0,er=g.errors*100/g.durations.length,critical=(p95>=Number(tc.slowP95Ms||1200))||(contrib>=Number(tc.criticalContributionPercent||25))||(er>Number(tc.maxErrorRatePercent||5));if(!critical)continue;
    const fingerprint=crypto.createHash('sha256').update(`${g.service}|${g.operation}`).digest('hex').slice(0,24);
    const recommendation=er>5?'inspect_errors_and_retry_boundaries':(contrib>=25?'reduce_critical_path_work_or_parallelize':'optimize_slow_operation');
    actions.push({fingerprint,serviceName:g.service,operation:g.operation,samples:g.durations.length,traceCount:g.traces.size,p50Ms:pct(g.durations,.5),p95Ms:p95,totalMs:Math.round(g.totalMs),contributionPercent:Math.round(contrib*100)/100,errorRatePercent:Math.round(er*100)/100,recommendation});
  }
  actions.sort((a,b)=>(b.contributionPercent*b.p95Ms)-(a.contributionPercent*a.p95Ms));actions.splice(Number(tc.topActions||12));
  for(const a of actions.slice(0,6)){
    try{
      await fetch(`${supa}/rest/v1/quality_trace_optimization_actions?on_conflict=trace_fingerprint`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'resolution=merge-duplicates,return=minimal'},body:JSON.stringify({trace_fingerprint:a.fingerprint,service_name:a.serviceName,operation:a.operation,p95_duration_ms:a.p95Ms,contribution_pct:a.contributionPercent,sample_count:a.samples,error_rate_pct:a.errorRatePercent,status:'open',recommendation:{kind:a.recommendation},payload:{traceCount:a.traceCount},updated_at:new Date().toISOString()}),signal:AbortSignal.timeout(12000)});
      if(tc.queueCriticalActions!==false){
        const priority=Math.max(1,Math.min(99,Math.round(100-Math.min(90,a.contributionPercent+a.errorRatePercent))));
        await fetch(`${supa}/rest/v1/quality_autopilot_queue?on_conflict=task_key`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({task_key:`trace:${a.fingerprint}`,kind:'quality',priority,state:'queued',payload:{source:'trace-critical-path',service:a.serviceName,operation:a.operation,p95Ms:a.p95Ms,contributionPercent:a.contributionPercent,errorRatePercent:a.errorRatePercent,recommendation:a.recommendation}}),signal:AbortSignal.timeout(12000)});
      }
    }catch(_){}
  }
  const report={generatedAt:new Date().toISOString(),status:actions.length?'TRACE_CRITICAL_PATH_ACTIONS_FOUND':'TRACE_CRITICAL_PATH_HEALTHY',pass:true,spanRows:rows.length,analyzedOperations:groups.size,actions,rule:'trace evidence prioritizes work but never auto-patches source by itself'};
  fs.writeFileSync(path.join(ROOT,'QUALITY_TRACE_OPTIMIZER_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[QUALITY_TRACE_OPTIMIZER] actions=${actions.length} spans=${rows.length}`);
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_TRACE_OPTIMIZER_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'TRACE_OPTIMIZER_FAILED',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(126)});
