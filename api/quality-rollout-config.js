'use strict';
const { createAdminClient }=require('../lib/env');
module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.end('Method Not Allowed');return}
  let out={ok:true,state:'inactive',stagePercent:0,candidateUrl:null,rolloutId:null,productionBaseUrl:process.env.QUALITY_PRODUCTION_BASE_URL||'https://world-server.vercel.app'};
  try{
    const admin=createAdminClient();
    const {data,error}=await admin.from('quality_rollout_state').select('rollout_id,state,stage_percent,candidate_url,candidate_sha,stage_started_at,expires_at').eq('project_key','world-server').maybeSingle();
    if(error)throw error;
    if(data){
      const expired=data.expires_at&&Date.parse(data.expires_at)<Date.now();
      out={...out,rolloutId:data.rollout_id||null,state:expired?'aborted':String(data.state||'inactive'),stagePercent:expired?0:Number(data.stage_percent||0),candidateUrl:expired?null:data.candidate_url||null,candidateSha:data.candidate_sha||null,stageStartedAt:data.stage_started_at||null,expiresAt:data.expires_at||null};
    }
  }catch(e){out={...out,ok:false,error:String(e?.message||e).slice(0,160)}}
  res.setHeader('Content-Type','application/json; charset=utf-8');
  res.setHeader('Cache-Control','public, max-age=0, s-maxage=10, stale-while-revalidate=20');
  res.statusCode=200;res.end(JSON.stringify(out));
};
