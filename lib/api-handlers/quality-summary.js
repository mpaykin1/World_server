'use strict';
const { createAdminClient } = require('../../lib/env');

function percentile(values,p){if(!values.length)return null;const a=[...values].sort((x,y)=>x-y);return a[Math.min(a.length-1,Math.max(0,Math.ceil(a.length*p)-1))];}
function finite(value){const n=Number(value);return Number.isFinite(n)?n:null;}
function parseCompact(message){if(!message)return null;try{const value=JSON.parse(message);return value&&typeof value==='object'?value:null;}catch{return null;}}
function avg(values){return values.length?Math.round(values.reduce((a,b)=>a+b,0)*1000/values.length)/1000:null;}
function newGroup(){return {sessions:0,fps:[],load:[],dom:[],errors:0,mobileSessions:0,pwaSamples:0,input:[],frame:[],jank:[],longTask:[],standaloneSamples:0,iosSessions:0,deviceSamples:0,thermalPressure:[],powerPressure:[],heapMb:[],contextLosses:0,stutter:[],capability:{},profiles:{},animationSamples:0,animationScores:[],animationViolations:0};}
module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.end('Method Not Allowed');return;}
  const hours=Math.max(1,Math.min(Number(req.query?.hours||24),168));const since=new Date(Date.now()-hours*3600000).toISOString();
  try{
    const admin=createAdminClient();
    const v4cols='created_at,app,event_type,load_ms,dom_ms,fps,error_count,coarse,message,quality_profile,capability_class,frame_p95_ms,input_latency_p95_ms,jank_rate,long_task_ms,heap_mb,webgl_context_losses,stutter_score,ios_webkit,standalone_pwa';
    let {data,error}=await admin.from('quality_telemetry').select(v4cols).gte('created_at',since).order('created_at',{ascending:false}).limit(10000);
    let legacy=false;
    if(error&&/column|schema cache/i.test(String(error.message||error))){legacy=true;const fallback=await admin.from('quality_telemetry').select('created_at,app,event_type,load_ms,dom_ms,fps,error_count,coarse,message').gte('created_at',since).order('created_at',{ascending:false}).limit(10000);data=fallback.data;error=fallback.error;}
    if(error)throw error;
    const groups={};
    for(const row of data||[]){
      const g=groups[row.app]||(groups[row.app]=newGroup());const p=parseCompact(row.message)||{};
      if(row.event_type==='quality_session'){g.sessions++;if(finite(row.fps)!==null)g.fps.push(Number(row.fps));if(finite(row.load_ms)!==null)g.load.push(Number(row.load_ms));if(finite(row.dom_ms)!==null)g.dom.push(Number(row.dom_ms));g.errors+=Number(row.error_count||0);if(row.coarse===true)g.mobileSessions++;}
      else if(row.event_type==='client_error'||row.event_type==='unhandled_rejection')g.errors++;
      if(row.event_type==='pwa_quality'||row.event_type==='runtime_stutter'){
        if(row.event_type==='pwa_quality')g.pwaSamples++;
        const input=finite(row.input_latency_p95_ms??p.i),frame=finite(row.frame_p95_ms??p.f),jank=finite(row.jank_rate??p.j),longTask=finite(row.long_task_ms??p.l),stutter=finite(row.stutter_score??p.st),heap=finite(row.heap_mb??p.hm),loss=finite(row.webgl_context_losses??p.cl);
        if(input!==null)g.input.push(input);if(frame!==null)g.frame.push(frame);if(jank!==null)g.jank.push(jank);if(longTask!==null)g.longTask.push(longTask);if(stutter!==null)g.stutter.push(stutter);if(heap!==null)g.heapMb.push(heap);if(loss!==null)g.contextLosses=Math.max(g.contextLosses,loss);
        const cap=row.capability_class||p.c;if(cap)g.capability[cap]=(g.capability[cap]||0)+1;const qp=row.quality_profile||p.q;if(qp)g.profiles[qp]=(g.profiles[qp]||0)+1;
        if(row.standalone_pwa===true||Number(p.s)===1)g.standaloneSamples++;if(row.ios_webkit===true||Number(p.iw)===1)g.iosSessions++;
      }else if(row.event_type==='pwa_device'){
        g.deviceSamples++;const th=finite(p.th),pp=finite(p.pp),hm=finite(row.heap_mb??p.hm),cl=finite(row.webgl_context_losses??p.cl);if(th!==null)g.thermalPressure.push(th);if(pp!==null)g.powerPressure.push(pp);if(hm!==null)g.heapMb.push(hm);if(cl!==null)g.contextLosses=Math.max(g.contextLosses,cl);const cap=row.capability_class||p.c;if(cap)g.capability[cap]=(g.capability[cap]||0)+1;if(row.ios_webkit===true||Number(p.iw)===1)g.iosSessions++;
      }else if(row.event_type==='animation_quality'){
        g.animationSamples+=Math.max(1,Number(p.n||1));const score=finite(p.s);if(score!==null)g.animationScores.push(score);g.animationViolations+=Math.max(0,Number(p.v||0));
      }
    }
    const apps={};
    for(const [app,g] of Object.entries(groups)){
      const capabilityClass=Object.entries(g.capability).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;const dominantProfile=Object.entries(g.profiles).sort((a,b)=>b[1]-a[1])[0]?.[0]||null;
      apps[app]={sessions:g.sessions,avgFps:g.fps.length?Math.round(g.fps.reduce((a,b)=>a+b,0)/g.fps.length):null,p10Fps:percentile(g.fps,.10),avgLoadMs:g.load.length?Math.round(g.load.reduce((a,b)=>a+b,0)/g.load.length):null,p95LoadMs:percentile(g.load,.95),p95DomMs:percentile(g.dom,.95),errors:g.errors,mobileSessions:g.mobileSessions,pwaSamples:g.pwaSamples,p95InputLatencyMs:percentile(g.input,.95),p95FrameMs:percentile(g.frame,.95),avgAnimationJankRate:avg(g.jank),p95LongTaskMs:percentile(g.longTask,.95),p95StutterScore:percentile(g.stutter,.95),standaloneSamples:g.standaloneSamples,iosSessions:g.iosSessions,deviceSamples:g.deviceSamples,sustainedPressureP95:percentile(g.thermalPressure,.95),powerPressureP95:percentile(g.powerPressure,.95),p95JsHeapMb:percentile(g.heapMb,.95),webglContextLosses:g.contextLosses,dominantCapabilityClass:capabilityClass,dominantQualityProfile:dominantProfile,animationSamples:g.animationSamples,animationScoreP10:percentile(g.animationScores,.10),animationViolations:g.animationViolations};
    }
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json; charset=utf-8');res.statusCode=200;res.end(JSON.stringify({ok:true,hours,since,legacyTelemetrySchema:legacy,apps}));
  }catch(e){res.statusCode=503;res.setHeader('Content-Type','application/json; charset=utf-8');res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,240)}));}
};
