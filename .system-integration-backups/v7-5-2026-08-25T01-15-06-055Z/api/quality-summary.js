'use strict';
const { createAdminClient } = require('../lib/env');

function percentile(values,p){
  if(!values.length)return null;
  const a=[...values].sort((x,y)=>x-y);
  return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*p)-1))];
}
module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.end('Method Not Allowed');return;}
  const hours=Math.max(1,Math.min(Number(req.query?.hours||24),168));
  const since=new Date(Date.now()-hours*3600000).toISOString();
  try{
    const admin=createAdminClient();
    const {data,error}=await admin.from('quality_telemetry')
      .select('created_at,app,event_type,load_ms,dom_ms,fps,error_count,coarse')
      .gte('created_at',since)
      .order('created_at',{ascending:false})
      .limit(5000);
    if(error)throw error;
    const groups={};
    for(const row of data||[]){
      const g=groups[row.app]||(groups[row.app]={sessions:0,fps:[],load:[],dom:[],errors:0,mobileSessions:0});
      if(row.event_type==='quality_session'){
        g.sessions++;
        if(Number.isFinite(row.fps))g.fps.push(row.fps);
        if(Number.isFinite(row.load_ms))g.load.push(row.load_ms);
        if(Number.isFinite(row.dom_ms))g.dom.push(row.dom_ms);
        g.errors+=Number(row.error_count||0);
        if(row.coarse===true)g.mobileSessions++;
      }else if(row.event_type==='client_error'||row.event_type==='unhandled_rejection'){
        g.errors++;
      }
    }
    const apps={};
    for(const [app,g] of Object.entries(groups)){
      apps[app]={
        sessions:g.sessions,
        avgFps:g.fps.length?Math.round(g.fps.reduce((a,b)=>a+b,0)/g.fps.length):null,
        p10Fps:percentile(g.fps,.10),
        avgLoadMs:g.load.length?Math.round(g.load.reduce((a,b)=>a+b,0)/g.load.length):null,
        p95LoadMs:percentile(g.load,.95),
        p95DomMs:percentile(g.dom,.95),
        errors:g.errors,
        mobileSessions:g.mobileSessions
      };
    }
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.statusCode=200;res.end(JSON.stringify({ok:true,hours,since,apps}));
  }catch(e){
    res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,240)}));
  }
};