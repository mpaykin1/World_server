'use strict';
const { createAdminClient } = require('../lib/env');

function clampNumber(value,min,max){
  const n=Number(value);
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.statusCode=405;res.end('Method Not Allowed');return;}
  const body=typeof req.body==='object'&&req.body?req.body:{};
  const row={
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
    message:body.message?String(body.message).slice(0,240):null
  };

  let persisted=false,persistError=null;
  try{
    const admin=createAdminClient();
    const {error}=await admin.from('quality_telemetry').insert(row);
    if(error)throw error;
    persisted=true;
  }catch(e){
    persistError=String(e?.message||e).slice(0,240);
  }

  console.log(JSON.stringify({
    level:persisted?'info':'warning',
    msg:'quality_telemetry',
    ...row,
    persisted,
    persistError,
    requestId:req.headers['x-vercel-id']||undefined
  }));
  res.setHeader('Cache-Control','no-store');
  res.statusCode=204;res.end();
};