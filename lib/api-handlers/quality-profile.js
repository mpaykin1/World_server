'use strict';
function percentile(values,p){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*p)-1))];}
function finite(v){const n=Number(v);return Number.isFinite(n)?n:null;}
function parse(message){try{const v=JSON.parse(message||'');return v&&typeof v==='object'?v:null;}catch{return null;}}
function recommend(rows){
  const fps=[],frame=[],jank=[],input=[],stutter=[];
  for(const row of rows){
    const p=parse(row.message);
    const values={fps:finite(row.fps),frame:finite(row.frame_p95_ms??p?.f),jank:finite(row.jank_rate??p?.j),input:finite(row.input_latency_p95_ms??p?.i),stutter:finite(row.stutter_score??p?.st)};
    if(values.fps!==null)fps.push(values.fps);if(values.frame!==null)frame.push(values.frame);if(values.jank!==null)jank.push(values.jank);if(values.input!==null)input.push(values.input);if(values.stutter!==null)stutter.push(values.stutter);
  }
  const evidence={samples:rows.length,p10Fps:percentile(fps,.1),p95FrameMs:percentile(frame,.95),avgJank:jank.length?jank.reduce((a,b)=>a+b,0)/jank.length:null,p95InputMs:percentile(input,.95),p95Stutter:percentile(stutter,.95)};
  let profile='high';
  if((evidence.p10Fps??60)<28||(evidence.p95FrameMs??0)>55||(evidence.avgJank??0)>.25||(evidence.p95Stutter??0)>.62)profile='performance';
  else if((evidence.p10Fps??60)<42||(evidence.p95FrameMs??0)>38||(evidence.avgJank??0)>.14||(evidence.p95InputMs??0)>120)profile='balanced';
  else if(rows.length>=30&&(evidence.p10Fps??0)>=56&&(evidence.p95FrameMs??99)<22&&(evidence.avgJank??1)<.05)profile='ultra';
  const confidence=rows.length>=80?'high':rows.length>=24?'medium':'low';
  return {profile,confidence,evidence};
}
module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.end('Method Not Allowed');return;}
  const app=String(req.query?.app||'').slice(0,64);const capability=String(req.query?.capability||'').slice(0,16);
  if(!app){res.statusCode=400;res.end(JSON.stringify({ok:false,error:'app required'}));return;}
  const since=new Date(Date.now()-7*86400000).toISOString();
  try{
    const { createAdminClient } = require('../env');
    const admin=createAdminClient();
    let q=admin.from('quality_telemetry').select('fps,frame_p95_ms,input_latency_p95_ms,jank_rate,stutter_score,capability_class,message').eq('app',app).in('event_type',['pwa_quality','runtime_stutter']).gte('created_at',since).order('created_at',{ascending:false}).limit(1200);
    if(['performance','balanced','high','ultra'].includes(capability))q=q.eq('capability_class',capability);
    let {data,error}=await q;
    if(error&&/column|schema cache/i.test(String(error.message||error))){
      const legacy=await admin.from('quality_telemetry').select('fps,message').eq('app',app).in('event_type',['pwa_quality','runtime_stutter']).gte('created_at',since).order('created_at',{ascending:false}).limit(1200);
      data=legacy.data;error=legacy.error;
    }
    if(error)throw error;
    const result=recommend(data||[]);
    res.setHeader('Cache-Control','public, max-age=300, stale-while-revalidate=1800');res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=200;res.end(JSON.stringify({ok:true,app,capability:capability||null,...result}));
  }catch(e){res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,240)}));}
};
module.exports.recommend=recommend;
