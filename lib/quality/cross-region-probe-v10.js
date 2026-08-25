'use strict';
async function runCrossRegionProbe(target,probers,{minRegions=3,timeoutMs=7000}={}){
  if(!target)return {ok:false,status:'HOLD',reason:'target-missing',regions:[]};
  const real=(probers||[]).filter(p=>p&&p.region&&p.url&&!p.simulated);
  if(new Set(real.map(x=>x.region)).size<minRegions)return {ok:false,status:'HOLD',reason:'insufficient-distinct-real-regions',regions:real.map(x=>x.region)};
  const results=[];
  for(const p of real){
    try{const ctl=new AbortController();const t=setTimeout(()=>ctl.abort(),timeoutMs);const u=new URL(p.url);u.searchParams.set('target',target);const r=await fetch(u,{headers:p.secret?{'authorization':`Bearer ${p.secret}`}:{},signal:ctl.signal});clearTimeout(t);const body=await r.json().catch(()=>({}));results.push({region:p.region,ok:r.ok&&body.ok!==false,status:r.status,latencyMs:Number(body.latencyMs)||null,verified:p.verified===true});}
    catch(e){results.push({region:p.region,ok:false,error:e.name||String(e),verified:p.verified===true});}
  }
  const ok=results.length>=minRegions&&results.every(x=>x.ok&&x.verified);
  return {ok,status:ok?'PASS':'HOLD',regions:results};
}
module.exports={runCrossRegionProbe};
