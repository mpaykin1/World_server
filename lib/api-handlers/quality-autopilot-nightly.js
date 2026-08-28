'use strict';
const crypto=require('crypto');
const { createAdminClient } = require('../env');

function authorized(req){const s=process.env.CRON_SECRET||'';return !!s&&req.headers.authorization===`Bearer ${s}`}
function nextGoal(q){for(const g of [60,70,80,90,95,98,100])if(q<g)return g;return 100}
const fp=(project,kind,area)=>crypto.createHash('sha1').update(JSON.stringify([project,kind,area])).digest('hex').slice(0,16);

module.exports=async function handler(req,res){
  if(req.method!=='GET'&&req.method!=='POST'){res.statusCode=405;res.end('Method Not Allowed');return}
  if(!authorized(req)){res.statusCode=401;res.end('Unauthorized');return}
  try{
    const admin=createAdminClient(),since=new Date(Date.now()-30*86400000).toISOString();

    // CPU learning pass: verified history -> success priors / expected delta / never-retry.
    const {data:events,error:eventError}=await admin.from('quality_learning_events')
      .select('project_key,fingerprint,action_kind,system_area,quality_delta,passed_all_gates')
      .gte('created_at',since).limit(5000);
    if(eventError)throw eventError;
    const agg=new Map();
    for(const e of events||[]){
      const key=e.fingerprint||fp(e.project_key||'global',e.action_kind||'unknown',e.system_area||'unknown');
      const a=agg.get(key)||{fingerprint:key,project_key:e.project_key||null,action_kind:e.action_kind||'unknown',system_area:e.system_area||null,attempts:0,successes:0,failures:0,cumulative_delta:0};
      a.attempts++;a.cumulative_delta+=Number(e.quality_delta||0);
      if(e.passed_all_gates===true&&Number(e.quality_delta||0)>=0)a.successes++;else a.failures++;
      agg.set(key,a);
    }
    const learned=[];
    for(const a of agg.values()){
      a.average_delta=a.attempts?a.cumulative_delta/a.attempts:0;
      a.never_retry=(a.failures>=3&&a.successes===0)||(a.attempts>=2&&a.average_delta<-.25);
      a.last_outcome={successProbability:(a.successes+1)/(a.attempts+2),learnedFromDays:30};
      learned.push(a);
    }
    if(learned.length){
      const {error}=await admin.from('quality_improvement_memory').upsert(learned,{onConflict:'fingerprint'});
      if(error)throw error;
    }
    const {data:memory,error:memoryError}=await admin.from('quality_improvement_memory').select('*').limit(5000);
    if(memoryError)throw memoryError;
    const exact=new Map((memory||[]).map(x=>[x.fingerprint,x]));
    const transferable=new Map();
    for(const m of memory||[]){
      if(m.never_retry||Number(m.average_delta||0)<=0)continue;
      const k=`${m.action_kind}:${m.system_area||''}`,a=transferable.get(k)||[];
      a.push(m);transferable.set(k,a);
    }

    const {data:projects,error}=await admin.from('quality_projects').select('*').eq('enabled',true).limit(100);
    if(error)throw error;
    const ranked=(projects||[]).map(p=>{
      const q=Number(p.current_quality||0),goal=Number(p.target_quality||nextGoal(q)),gap=Math.max(0,goal-q);
      const priority=Number(p.user_priority||50)*.35+gap*1.8+Number(p.release_blockers||0)*15+Number(p.activity_score||0)*.4;
      return {...p,goal,priority};
    }).sort((a,b)=>b.priority-a.priority).slice(0,12);

    const actions=[
      ['safe_autofix','code',90,1.5],
      ['regression_expand','tests',90,1.4],
      ['incremental_test_plan','tests',30,.6],
      ['cpu_genetic_optimize','performance',240,1.25],
      ['static_review','code',60,1.1],
      ['asset_dedup','assets',180,.5],
      ['asset_similarity_scan','assets',240,.55],
      ['cpu_texture_optimize','textures',300,.9],
      ['cpu_mesh_audit','meshes',360,1.0],
      ['root_cause_review','quality',120,1.0],
      ['knowledge_learn','learning',60,.7]
    ];
    const rows=[];
    for(const project of ranked){
      let perProject=0;
      for(const [kind,area,cpu,impact] of actions){
        const fingerprint=fp(project.project_key,kind,area),m=exact.get(fingerprint);
        if(m?.never_retry)continue;
        const same=transferable.get(`${kind}:${area}`)||[];
        const transferDelta=same.length?same.reduce((a,x)=>a+Number(x.average_delta||0),0)/same.length:0;
        const success=m?.last_outcome?.successProbability??((Number(m?.successes||0)+1)/(Number(m?.attempts||0)+2));
        const expected=Math.max(0,impact+Number(m?.average_delta||0)+transferDelta*.25)*(.5+success);
        rows.push({
          project_key:project.project_key,task_kind:kind,
          task_payload:{systemArea:area,expectedImpact:impact,targetQuality:project.goal,fingerprint,learnedSuccessProbability:success,transferDelta},
          priority:project.priority*expected/Math.max(30,cpu),
          estimated_cpu_seconds:cpu,estimated_paid_cost:0,requires_gpu:false
        });
        perProject++;if(perProject>=3)break;
      }
    }
    rows.sort((a,b)=>b.priority-a.priority);
    const selected=rows.slice(0,20);
    let inserted=[];
    if(selected.length){
      const {data,error:insertError}=await admin.from('quality_autopilot_queue').insert(selected).select('id,project_key,task_kind,priority');
      if(insertError)throw insertError;inserted=data||[];
    }
    await admin.from('quality_nightly_runs').insert({
      projects_scanned:ranked.length,jobs_enqueued:inserted.length,paid_cost:0,
      summary:{cpuOnly:true,gpu:false,paidCompute:false,learningEvents:(events||[]).length,learnedPatterns:learned.length,neverRetry:learned.filter(x=>x.never_retry).length,projects:ranked.map(x=>x.project_key)}
    });
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.statusCode=200;res.end(JSON.stringify({ok:true,cpuOnly:true,gpu:false,paidCost:0,projects:ranked.length,jobs:inserted.length,learningEvents:(events||[]).length,learnedPatterns:learned.length}));
  }catch(e){
    res.statusCode=500;res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ok:false,error:String(e?.message||e).slice(0,300)}));
  }
};
