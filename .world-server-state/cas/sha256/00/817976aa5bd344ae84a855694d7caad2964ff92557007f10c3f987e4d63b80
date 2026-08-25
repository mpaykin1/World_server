'use strict';
const { createAdminClient }=require('../lib/env');
const trace=require('../lib/quality-trace');
function short(v,n){return v==null?null:String(v).slice(0,n)}
function bearer(req){const h=String(req.headers?.authorization||'');return h.startsWith('Bearer ')?h.slice(7):''}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.statusCode=405;res.end('Method Not Allowed');return}
  const expected=process.env.QUALITY_TRACE_TOKEN||'';
  if(!expected||bearer(req)!==expected){res.statusCode=401;res.end('Unauthorized');return}
  const b=typeof req.body==='object'&&req.body?req.body:{};
  const parsed=trace.parseTraceparent(b.traceparent);const c=parsed?{traceId:parsed.traceId,parentSpanId:parsed.parentSpanId,spanId:trace.context().spanId}:trace.context();
  const nowNs=BigInt(Date.now())*1000000n,durationMs=Math.max(0,Math.min(Number(b.durationMs||0),3600000));
  const endNs=b.endUnixNano&&/^\d{10,24}$/.test(String(b.endUnixNano))?BigInt(b.endUnixNano):nowNs;
  const startNs=b.startUnixNano&&/^\d{10,24}$/.test(String(b.startUnixNano))?BigInt(b.startUnixNano):endNs-BigInt(Math.round(durationMs*1e6));
  const service=short(b.serviceName||'external',64),operation=short(b.name||b.operation||'unknown',120);
  const span={trace_id:c.traceId,span_id:short(b.spanId,16)&&trace.validSpanId(b.spanId)?String(b.spanId).toLowerCase():c.spanId,parent_span_id:short(b.parentSpanId,16)&&trace.validSpanId(b.parentSpanId)?String(b.parentSpanId).toLowerCase():c.parentSpanId,service_name:service,operation,start_unix_nano:String(startNs),end_unix_nano:String(endNs),duration_ms:Number(endNs-startNs)/1e6,status:String(b.status||'OK').toUpperCase()==='ERROR'?'ERROR':'OK',attributes:trace.cleanAttributes({...b.attributes,edge_region:process.env.VERCEL_REGION||null,deployment_url:process.env.VERCEL_URL?`https://${process.env.VERCEL_URL}`:null})};
  try{const admin=createAdminClient();await trace.persistSpan(admin,span);trace.exportOtlp(span).catch(()=>{});res.setHeader('traceparent',trace.makeTraceparent({traceId:span.trace_id,spanId:span.span_id,flags:'01'}));res.statusCode=202;res.end(JSON.stringify({ok:true,traceId:span.trace_id,spanId:span.span_id}))}
  catch(e){res.statusCode=503;res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,160)}))}
};
