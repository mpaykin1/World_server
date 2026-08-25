#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),o=cfg.opentelemetry||{},strict=process.argv.includes('--strict');
const url=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
(async()=>{
  if(!url||!key){const r={generatedAt:new Date().toISOString(),status:'OTEL_REMOTE_CHECK_SKIPPED_NO_SECRETS',pass:!strict,fullContinuityReady:false};fs.writeFileSync(path.join(ROOT,'QUALITY_OTEL_BRIDGE_REPORT.json'),JSON.stringify(r,null,2)+'\n');if(strict)process.exit(105);return}
  const since=new Date(Date.now()-Number(o.healthWindowHours||24)*3600000).toISOString();
  const q=`${url}/rest/v1/${encodeURIComponent(o.supabaseSpanTable||'quality_trace_spans')}?select=trace_id,service_name,operation,status,created_at&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=3000`;
  const resp=await fetch(q,{headers:{apikey:key,authorization:`Bearer ${key}`},signal:AbortSignal.timeout(15000)});if(!resp.ok)throw new Error(`Supabase ${resp.status}: ${await resp.text()}`);const rows=await resp.json();
  const services={},traceServices=new Map();for(const row of rows){services[row.service_name]=(services[row.service_name]||0)+1;const s=traceServices.get(row.trace_id)||new Set();s.add(row.service_name);traceServices.set(row.trace_id,s)}
  const core=o.coreRequiredServices||['vercel-api'],full=o.fullReadinessServices||['vercel-api','ai3d-worker','godot-runtime'];
  const missingCore=core.filter(x=>!services[x]),missingFull=full.filter(x=>!services[x]);
  const crossServiceTraces=[...traceServices.entries()].filter(([,s])=>s.size>=2).length;
  const pass=missingCore.length===0&&(!strict||missingFull.length===0),fullContinuityReady=missingFull.length===0;
  const report={generatedAt:new Date().toISOString(),status:pass?(fullContinuityReady?'OTEL_FULL_CONTINUITY_READY':'OTEL_CORE_READY_EXTERNAL_PENDING'):'OTEL_CONTINUITY_MISSING',pass,strict,rows:rows.length,services,crossServiceTraces,missingCore,missingFull,fullContinuityReady,w3cTraceContext:true};
  fs.writeFileSync(path.join(ROOT,'QUALITY_OTEL_BRIDGE_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[QUALITY_OTEL] ${report.status} spans=${rows.length} cross=${crossServiceTraces}`);if(!pass)process.exit(106);
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_OTEL_BRIDGE_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'OTEL_CHECK_FAILED',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(107)});
