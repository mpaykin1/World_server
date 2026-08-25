#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const {ROOT,writeJSON,nowIso}=require('./integration-utils.cjs');
const {startSpan,LOG}=require('./integration-telemetry-lib.cjs');
(async()=>{
  const [cmd='health',name='manual-span',attrs='{}']=process.argv.slice(2);
  if(cmd==='health'){
    const status={schemaVersion:'2.0.0',generatedAt:nowIso(),w3cTraceContext:true,otlpHttpJson:true,localJsonl:true,logPath:path.relative(ROOT,LOG).replaceAll('\\','/'),endpointConfigured:Boolean(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT||process.env.OTEL_EXPORTER_OTLP_ENDPOINT),pass:true};
    writeJSON(path.join(ROOT,'INTEGRATION_TELEMETRY_STATUS.json'),status);console.log(JSON.stringify(status,null,2));return;
  }
  if(cmd==='span'){
    let a={};try{a=JSON.parse(attrs)}catch{}
    const s=startSpan(name,a);await new Promise(r=>setTimeout(r,1));await s.end('OK');console.log(JSON.stringify({ok:true,traceparent:s.traceparent},null,2));return;
  }
  console.error('usage: integration-telemetry.cjs health | span <name> <json-attrs>');process.exit(2);
})().catch(e=>{console.error('[INTEGRATION_TELEMETRY] FAIL',e.stack||e.message);process.exit(2)});
