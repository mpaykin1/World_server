'use strict';
const { createAdminClient } = require('../../lib/env');
function authorized(req){const t=process.env.AUTOPILOT_WORKER_TOKEN||'';return !!t&&req.headers.authorization===`Bearer ${t}`}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.statusCode=405;res.end('Method Not Allowed');return}
  if(!authorized(req)){res.statusCode=401;res.end('Unauthorized');return}
  const body=typeof req.body==='object'&&req.body?req.body:{},action=String(body.action||'claim');
  try{
    const admin=createAdminClient();
    if(action==='claim'){
      const worker=String(body.worker||'desktop-cpu').slice(0,80),max=Math.max(30,Math.min(Number(body.maxCpuSeconds||3600),14400));
      const {data,error}=await admin.rpc('claim_quality_autopilot_job',{p_worker:worker,p_max_cpu_seconds:max});
      if(error)throw error;const job=Array.isArray(data)?data[0]||null:null;
      res.setHeader('Content-Type','application/json');res.statusCode=200;res.end(JSON.stringify({ok:true,job}));return;
    }
    if(action==='complete'||action==='fail'){
      const id=Number(body.id);if(!Number.isFinite(id))throw new Error('job id required');
      const status=action==='complete'?'completed':'failed',result=body.result||{};
      if(result.requiresGpu===true||Number(result.paidCost||0)>0)throw new Error('GPU/paid result rejected by CPU-only policy');
      const {error}=await admin.from('quality_autopilot_queue').update({status,finished_at:new Date().toISOString(),result}).eq('id',id);
      if(error)throw error;
      if(body.learningEvent){
        const e=body.learningEvent;
        await admin.from('quality_learning_events').insert({
          project_key:e.projectKey||null,fingerprint:e.fingerprint||null,action_kind:e.actionKind||'unknown',
          system_area:e.systemArea||null,features:e.features||{},quality_before:e.qualityBefore??null,
          quality_after:e.qualityAfter??null,quality_delta:e.qualityDelta??null,
          passed_all_gates:e.passedAllGates===true,transferred_from_project:e.transferredFromProject||null,
          outcome:e.outcome||{}
        });
      }
      res.setHeader('Content-Type','application/json');res.statusCode=200;res.end(JSON.stringify({ok:true,status}));return;
    }
    res.statusCode=400;res.end(JSON.stringify({ok:false,error:'unknown action'}));
  }catch(e){res.statusCode=500;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,300)}))}
};
