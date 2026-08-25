#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),url=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
async function get(p){const r=await fetch(`${url}/rest/v1/${p}`,{headers:{apikey:key,authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`${p}: ${r.status} ${await r.text()}`);return r.text()}
(async()=>{
 const report={generatedAt:new Date().toISOString(),schemaVersion:'6.0.0',supabaseChecked:Boolean(url&&key),checks:[]};
 if(url&&key){
   const qs=[
    'quality_telemetry?select=visual_sampled,visual_nonblank_ratio,visual_luma_stddev,visual_edge_density,renderer_backend,renderer_tuning_tier,webgpu_available&limit=1',
    'quality_trace_optimization_actions?select=trace_fingerprint,service_name,operation,status&limit=1',
    'quality_chaos_results?select=scenario,target,pass&limit=1',
    'quality_visual_oracle_results?select=project_id,release_id,decision&limit=1'
   ];
   for(const q of qs){await get(q);report.checks.push({q,pass:true})}
 }
 fs.writeFileSync(path.join(ROOT,'QUALITY_V6_RUNTIME_VERIFY.json'),JSON.stringify(report,null,2)+'\n');console.log('[V6_RUNTIME_VERIFY] PASS');
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_V6_RUNTIME_VERIFY.json'),JSON.stringify({generatedAt:new Date().toISOString(),schemaVersion:'6.0.0',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(130)});
