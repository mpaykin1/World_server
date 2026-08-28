#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();

// Reuse existing Supabase client if available, otherwise use local state as fallback
async function getSupabase(){
  try{
    const { createClient } = require('@supabase/supabase-js');
    const url=process.env.SUPABASE_URL||process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key=process.env.SUPABASE_SECRET_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if(!url||!key) return null;
    return createClient(url,key);
  }catch{ return null; }
}

async function pollAdvisories(){
  const supabase=await getSupabase();
  if(!supabase){
    // Fallback to local file polling (for offline dev)
    const local=path.join(ROOT,'state','ai-advisories.json');
    if(fs.existsSync(local)){
      const arr=JSON.parse(fs.readFileSync(local,'utf8'));
      return arr.filter(a=>a.status==='pending').slice(0,5);
    }
    return [];
  }
  const { data, error } = await supabase.from('ai_supervisor_advisories').select('*').eq('status','pending').order('priority',{ascending:true}).order('created_at',{ascending:true}).limit(5);
  if(error){ console.error('poll error',error.message); return []; }
  return data||[];
}

async function reportStatus(report){
  const supabase=await getSupabase();
  const payload={
    agent: report.agent||'opencode',
    task_id: report.task_id||'unknown',
    status: report.status||'in_progress',
    progress: report.progress||0,
    branch: report.branch||'unknown',
    worktree: report.worktree||'',
    commit: report.commit||null,
    pr: report.pr||null,
    tests: report.tests||{},
    blockers: report.blockers||[],
    merge_safe: report.merge_safe||false,
    next_action: report.next_action||'',
    findings: report.findings||{},
    reusable_improvements: report.reusable_improvements||[]
  };
  if(supabase){
    const { error } = await supabase.from('ai_agent_reports').insert(payload);
    if(error) console.error('report error',error.message);
    else console.log('REPORT WRITE: PASS');
  } else {
    const p=path.join(ROOT,'state','ai-agent-reports.jsonl');
    fs.mkdirSync(path.dirname(p),{recursive:true});
    fs.appendFileSync(p, JSON.stringify({at:new Date().toISOString(),...payload})+'\n');
    console.log('REPORT WRITE: PASS (local)');
  }
}

async function main(){
  const cmd=process.argv[2]||'poll';
  if(cmd==='poll'){
    const advisories=await pollAdvisories();
    console.log(`ADVISORY READ: PASS (${advisories.length} pending)`);
    for(const adv of advisories){
      console.log(`Advisory ${adv.advisory_id}: ${adv.task} (priority ${adv.priority})`);
      // NEVER auto-execute shell/SQL, just log for human verification
      console.log(`  Rationale: ${adv.rationale}`);
      console.log(`  Expected: ${adv.expected_result}`);
      console.log(`  Verification: ${adv.verification_required}`);
      // The agent should now independently inspect project, verify intent, and decide to accept/improve/reject
    }
    if(advisories.length===0) console.log('No pending advisories');
  } else if(cmd==='report'){
    // Example: node scripts/ai-supervisor-watcher.cjs report --task_id foo --status pass ...
    const args=require('minimist')?null:null;
    // For now, just write a heartbeat report
    const gitBranch=require('child_process').execSync('git branch --show-current',{encoding:'utf8'}).trim();
    const commit=require('child_process').execSync('git rev-parse --short HEAD',{encoding:'utf8'}).trim();
    await reportStatus({
      agent:'opencode',
      task_id:'heartbeat',
      status:'in_progress',
      progress:50,
      branch:gitBranch,
      commit,
      next_action:'continue local-gates 2/6',
      merge_safe:false
    });
  } else if(cmd==='watch'){
    // Run as poller every 2m using existing watchdog interval
    setInterval(async()=>{
      const advs=await pollAdvisories();
      if(advs.length) console.log(`[WATCHER] ${advs.length} advisories pending`);
    }, 2*60*1000);
    console.log('Watcher started every 2m (reuse existing watchdog, no duplicate scheduler)');
  }
}

if(require.main===module) main().catch(e=>{console.error(e);process.exit(1);});
module.exports={pollAdvisories, reportStatus};
