'use strict';
const { createAdminClient } = require('../../lib/env');
const { readJsonBody } = require('../../lib/http');

function clampNumber(value,min,max){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;
}
function cleanEnum(value, allowed){
  const s=String(value||'');return allowed.includes(s)?s:null;
}
function legacyMessage(body){
  if(body.message)return String(body.message).slice(0,240);
  const compact={
    i:clampNumber(body.inputLatencyP95Ms,0,10000),
    f:clampNumber(body.frameP95Ms,0,10000),
    j:clampNumber(body.jankRate,0,1),
    l:clampNumber(body.longTaskMs,0,120000),
    q:cleanEnum(body.qualityProfile,['performance','balanced','high','ultra']),
    c:cleanEnum(body.capabilityClass,['performance','balanced','high','ultra']),
    hm:clampNumber(body.heapMb,0,65536),
    cl:clampNumber(body.webglContextLosses,0,1000),
    st:clampNumber(body.stutterScore,0,1),
    iw:body.iosWebkit===true?1:0,
    s:body.standalonePwa===true?1:0
  };
  return JSON.stringify(compact).slice(0,240);
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.statusCode=405;res.end('Method Not Allowed');return;}
  let body={};try{body=await readJsonBody(req);}catch{res.statusCode=400;res.end('Bad Request');return;}
  const base={
    app:String(body.app||'unknown').slice(0,64),
    event_type:String(body.type||'unknown').slice(0,64),
    path:String(body.path||'').slice(0,160),
    load_ms:clampNumber(body.loadMs,0,120000),
    dom_ms:clampNumber(body.domMs,0,120000),
    fps:clampNumber(body.fps,0,240),
    error_count:clampNumber(body.errors,0,1000),
    coarse:typeof body.coarse==='boolean'?body.coarse:null,
    viewport_w:Array.isArray(body.viewport)?clampNumber(body.viewport[0],1,10000):null,
    viewport_h:Array.isArray(body.viewport)?clampNumber(body.viewport[1],1,10000):null,
    dpr:clampNumber(body.dpr,.25,8),
    message:legacyMessage(body)
  };
  const v4={
    ...base,
    quality_profile:cleanEnum(body.qualityProfile,['performance','balanced','high','ultra']),
    capability_class:cleanEnum(body.capabilityClass,['performance','balanced','high','ultra']),
    frame_p95_ms:clampNumber(body.frameP95Ms,0,10000),
    input_latency_p95_ms:clampNumber(body.inputLatencyP95Ms,0,10000),
    jank_rate:clampNumber(body.jankRate,0,1),
    long_task_ms:clampNumber(body.longTaskMs,0,120000),
    heap_mb:clampNumber(body.heapMb,0,65536),
    webgl_context_losses:clampNumber(body.webglContextLosses,0,1000),
    stutter_score:clampNumber(body.stutterScore,0,1),
    ios_webkit:typeof body.iosWebkit==='boolean'?body.iosWebkit:null,
    standalone_pwa:typeof body.standalonePwa==='boolean'?body.standalonePwa:null
  };
  let persisted=false,persistError=null,legacyFallback=false;
  try{
    const admin=createAdminClient();
    let result=await admin.from('quality_telemetry').insert(v4);
    if(result.error&&/column|schema cache/i.test(String(result.error.message||result.error))){
      legacyFallback=true;
      result=await admin.from('quality_telemetry').insert(base);
    }
    if(result.error)throw result.error;
    persisted=true;
  }catch(e){persistError=String(e?.message||e).slice(0,240);}
  console.log(JSON.stringify({level:persisted?'info':'warning',msg:'quality_telemetry',app:base.app,event_type:base.event_type,persisted,legacyFallback,persistError,requestId:req.headers['x-vercel-id']||undefined}));
  res.setHeader('Cache-Control','no-store');res.statusCode=204;res.end();
};
