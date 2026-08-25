'use strict';
const fs=require('fs');
const path=require('path');
const crypto=require('crypto');
const {ROOT,ensureDir,writeJSON,nowIso}=require('./integration-utils.cjs');
const LOG=path.join(ROOT,'.world-server-state','telemetry','integration-spans.jsonl');
const STATUS=path.join(ROOT,'INTEGRATION_TELEMETRY_STATUS.json');
ensureDir(path.dirname(LOG));
function hex(n){return crypto.randomBytes(n).toString('hex')}
function parseTraceparent(v){const m=/^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/i.exec(String(v||''));return m?{traceId:m[1].toLowerCase(),parentSpanId:m[2].toLowerCase(),flags:m[3]}:null}
function startSpan(name,attributes={},parentTraceparent=process.env.TRACEPARENT){
  const parent=parseTraceparent(parentTraceparent),traceId=parent?.traceId||hex(16),spanId=hex(8),startMs=Date.now(),startNs=BigInt(startMs)*1000000n;
  const traceparent=`00-${traceId}-${spanId}-01`;
  let ended=false;
  return {traceId,spanId,traceparent,name,attributes,end:async(status='OK',extra={})=>{
    if(ended)return; ended=true; const endMs=Date.now(),endNs=BigInt(endMs)*1000000n;
    const span={schemaVersion:'1.0.0',name,traceId,spanId,parentSpanId:parent?.parentSpanId||null,traceparent,startTimeUnixNano:String(startNs),endTimeUnixNano:String(endNs),durationMs:endMs-startMs,status,attributes:{...attributes,...extra}};
    fs.appendFileSync(LOG,JSON.stringify(span)+'\n');
    const endpoint=String(process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT||process.env.OTEL_EXPORTER_OTLP_ENDPOINT||'').trim();
    let exported=false,exportError=null;
    if(endpoint){
      const url=endpoint.endsWith('/v1/traces')?endpoint:endpoint.replace(/\/$/,'')+'/v1/traces';
      const body={resourceSpans:[{resource:{attributes:[{key:'service.name',value:{stringValue:'world-server-integration'}},{key:'service.version',value:{stringValue:'2'}}]},scopeSpans:[{scope:{name:'world-server.integration',version:'2.0.0'},spans:[{traceId,spanId,parentSpanId:parent?.parentSpanId||undefined,name,kind:1,startTimeUnixNano:String(startNs),endTimeUnixNano:String(endNs),attributes:Object.entries(span.attributes).map(([key,value])=>({key,value:typeof value==='number'?{doubleValue:value}:typeof value==='boolean'?{boolValue:value}:{stringValue:String(value)}})),status:{code:status==='OK'?1:2,message:status}}]}]}]};
      try{const res=await fetch(url,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});exported=res.ok;if(!res.ok)exportError=`HTTP ${res.status}`;}catch(e){exportError=e.message}
    }
    writeJSON(STATUS,{schemaVersion:'2.0.0',generatedAt:nowIso(),localJsonl:true,w3cTraceContext:true,otlpHttpJson:true,endpointConfigured:Boolean(endpoint),lastExported:exported,lastExportError:exportError,lastTraceId:traceId,lastSpanId:spanId,pass:true,status:exportError?'LOCAL_OK_REMOTE_WARN':'PASS'});
  }}
}
async function withSpan(name,attributes,fn,parent){const s=startSpan(name,attributes,parent);try{const v=await fn(s);await s.end('OK');return v}catch(e){await s.end('ERROR',{error:e.message});throw e}}
module.exports={startSpan,withSpan,parseTraceparent,LOG,STATUS};
