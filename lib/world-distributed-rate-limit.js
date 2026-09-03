'use strict';
async function consume(admin,{actorId,scope,limit=10,windowSeconds=60,failOpen=false}={}){
  actorId=String(actorId||'').slice(0,160);scope=String(scope||'default').slice(0,96);limit=Math.max(1,Math.min(10000,Number(limit)||10));windowSeconds=Math.max(1,Math.min(86400,Number(windowSeconds)||60));
  if(!actorId)return{allowed:false,reason:'missing-actor'};
  const {data,error}=await admin.rpc('world_consume_rate_limit_v6',{p_actor_key:actorId,p_scope:scope,p_limit:limit,p_window_seconds:windowSeconds});
  if(error){if(failOpen)return{allowed:true,degraded:true,reason:'rpc-unavailable'};const e=new Error('Distributed rate limiter unavailable.');e.status=503;throw e}
  const row=Array.isArray(data)?data[0]:data;return{allowed:Boolean(row?.allowed),remaining:Number(row?.remaining??0),resetAt:row?.reset_at||null,reason:'distributed'};
}
module.exports={consume};
