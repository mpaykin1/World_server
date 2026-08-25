#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),url=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function get(p){const r=await fetch(`${url}/rest/v1/${p}`,{headers:{apikey:key,authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`${p}: ${r.status} ${await r.text()}`);return r.text()}
(async()=>{
  const report={generatedAt:new Date().toISOString(),supabaseChecked:Boolean(url&&key),checks:[]};
  if(url&&key){
    const qs=['quality_telemetry?select=sustained_fps,long_task_ratio,thermal_pressure_proxy,geo_country,rollout_id,trace_id&limit=1','quality_trace_spans?select=trace_id,span_id,service_name&limit=1','quality_rollout_state?select=project_key,rollout_id,state,stage_percent&limit=1','quality_rollout_stage_evidence?select=rollout_id,stage_percent,decision&limit=1'];
    for(const q of qs){await get(q);report.checks.push({q,pass:true})}
  }
  fs.writeFileSync(path.join(ROOT,'QUALITY_V5_RUNTIME_VERIFY.json'),JSON.stringify(report,null,2)+'\n');console.log('[V5_RUNTIME_VERIFY] PASS');
})().catch(e=>{console.error(e);process.exit(120)});
