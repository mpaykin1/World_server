'use strict';
const { createAdminClient } = require('../env');
module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.statusCode=405;res.end('Method Not Allowed');return}
  try{
    const admin=createAdminClient(),since=new Date(Date.now()-24*3600000).toISOString();
    const [runs,jobs,events]=await Promise.all([
      admin.from('quality_nightly_runs').select('*').gte('started_at',since).order('started_at',{ascending:false}).limit(5),
      admin.from('quality_autopilot_queue').select('status,project_key,task_kind,result,finished_at').gte('created_at',since).limit(500),
      admin.from('quality_learning_events').select('project_key,action_kind,quality_delta,passed_all_gates').gte('created_at',since).limit(500)
    ]);
    if(runs.error)throw runs.error;if(jobs.error)throw jobs.error;if(events.error)throw events.error;
    const completed=(jobs.data||[]).filter(x=>x.status==='completed'),failed=(jobs.data||[]).filter(x=>x.status==='failed');
    const delta=(events.data||[]).reduce((a,x)=>a+Number(x.quality_delta||0),0);
    res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
    res.statusCode=200;res.end(JSON.stringify({ok:true,cpuOnly:true,gpu:false,paidCost:0,runs:runs.data||[],jobs:{total:(jobs.data||[]).length,completed:completed.length,failed:failed.length},qualityDelta:Math.round(delta*100)/100}));
  }catch(e){res.statusCode=503;res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,300)}))}
};
