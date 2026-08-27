'use strict';
const crypto=require('crypto');
function hex(bytes){return crypto.randomBytes(bytes).toString('hex')}
function validTraceId(x){return /^[0-9a-f]{32}$/i.test(String(x||''))&&!/^0+$/.test(String(x||''))}
function validSpanId(x){return /^[0-9a-f]{16}$/i.test(String(x||''))&&!/^0+$/.test(String(x||''))}
function parseTraceparent(value){
  const m=/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(String(value||'').trim());
  if(!m||!validTraceId(m[1])||!validSpanId(m[2]))return null;
  return{traceId:m[1].toLowerCase(),parentSpanId:m[2].toLowerCase(),flags:m[3].toLowerCase()};
}
function context(traceparent){const p=parseTraceparent(traceparent);return{traceId:p?.traceId||hex(16),parentSpanId:p?.parentSpanId||null,spanId:hex(8),flags:p?.flags||'01'}}
function makeTraceparent(c){return`00-${c.traceId}-${c.spanId}-${c.flags||'01'}`}
function cleanAttributes(input,max=32,maxLen=300){
  const out={};let n=0;
  for(const [k,v] of Object.entries(input&&typeof input==='object'?input:{})){
    if(n++>=max)break;const key=String(k).slice(0,80);
    if(v==null||typeof v==='boolean'||typeof v==='number')out[key]=v;
    else out[key]=String(v).slice(0,maxLen);
  }return out;
}
async function persistSpan(admin,span){const{error}=await admin.from('quality_trace_spans').insert(span);if(error)throw error}
async function exportOtlp(span){
  const base=String(process.env.OTEL_EXPORTER_OTLP_ENDPOINT||'').replace(/\/$/,'');if(!base)return;
  const endpoint=base.endsWith('/v1/traces')?base:`${base}/v1/traces`;
  const attrs=Object.entries(span.attributes||{}).map(([key,value])=>({key,value:typeof value==='boolean'?{boolValue:value}:typeof value==='number'?{doubleValue:value}:{stringValue:String(value)}}));
  const payload={resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:span.service_name}}]},scopeSpans:[{scope:{name:'world-server-quality-autopilot',version:'5.0.0'},spans:[{traceId:span.trace_id,spanId:span.span_id,parentSpanId:span.parent_span_id||undefined,name:span.operation,startTimeUnixNano:String(span.start_unix_nano),endTimeUnixNano:String(span.end_unix_nano),attributes:attrs,status:{code:span.status==='ERROR'?2:1}}]}]}]};
  const headers={'content-type':'application/json'};
  if(process.env.OTEL_EXPORTER_OTLP_HEADERS){for(const part of process.env.OTEL_EXPORTER_OTLP_HEADERS.split(',')){const i=part.indexOf('=');if(i>0)headers[part.slice(0,i).trim()]=part.slice(i+1).trim()}}
  const r=await fetch(endpoint,{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(5000)});if(!r.ok)throw new Error(`OTLP ${r.status}`);
}
module.exports={parseTraceparent,context,makeTraceparent,cleanAttributes,persistSpan,exportOtlp,validTraceId,validSpanId};
