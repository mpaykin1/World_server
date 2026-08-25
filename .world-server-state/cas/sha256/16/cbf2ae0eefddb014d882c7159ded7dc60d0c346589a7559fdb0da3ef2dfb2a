#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),os=require('os'),cp=require('child_process'),crypto=require('crypto');

const ROOT=path.resolve(process.env.WORLD_SERVER_ROOT||process.cwd());
const SERVER=(process.env.WORLD_SERVER_URL||'https://world-server.vercel.app').replace(/\/$/,'');
const TOKEN=process.env.AUTOPILOT_WORKER_TOKEN||'';
const FORCE=process.argv.includes('--force');
const worker=`cpu-night-${os.hostname()}`.slice(0,80);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));

function hourTbilisi(){const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tbilisi',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date());return Number(parts.find(x=>x.type==='hour')?.value||0)}
function inNightWindow(){const h=hourTbilisi();return h>=0&&h<8}
function cpuPercent(){
 const before=os.cpus().map(c=>({...c.times}));
 return new Promise(resolve=>setTimeout(()=>{const after=os.cpus(),vals=after.map((c,i)=>{const a=before[i],b=c.times,total=(b.user-a.user)+(b.nice-a.nice)+(b.sys-a.sys)+(b.idle-a.idle)+(b.irq-a.irq),busy=total-(b.idle-a.idle);return total?busy/total*100:0});resolve(vals.reduce((a,b)=>a+b,0)/Math.max(1,vals.length))},1000));
}
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',stdio:opts.capture?'pipe':'inherit',shell:process.platform==='win32'});return r}
function quality(){try{const j=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-scorecard.json'),'utf8')),v=Object.values(j.metrics||{}).map(x=>Number(x.percent)).filter(Number.isFinite);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0}catch{return 0}}
async function api(body){if(!TOKEN)throw new Error('AUTOPILOT_WORKER_TOKEN is required');const r=await fetch(`${SERVER}/api/quality-autopilot-worker`,{method:'POST',headers:{authorization:`Bearer ${TOKEN}`,'content-type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});const j=await r.json();if(!r.ok||j.ok!==true)throw new Error(j.error||`HTTP ${r.status}`);return j}
function clean(){const r=run('git',['status','--porcelain'],{capture:true});return r.status===0&&!r.stdout.trim()}
function commandFor(job){
 const map={
  safe_autofix:[['npm',['run','quality:autofix']]],
  regression_expand:[['npm',['run','quality:generate-tests']]],
  static_review:[['npm',['run','project:review']],['npm',['run','quality:root-cause']]],
  asset_dedup:[['npm',['run','quality:assets-dedup']]],
  asset_similarity_scan:[['npm',['run','quality:asset-similarity']]],
  performance_tune:[['npm',['run','quality:risk']],['npm',['run','quality:impact']]],
  golden_adoption:[['npm',['run','golden:check']]],
  root_cause_review:[['npm',['run','quality:root-cause']]],
  incremental_test_plan:[['npm',['run','quality:incremental-tests']],['npm',['run','quality:test-cache-smoke']]],
  cpu_genetic_optimize:[['npm',['run','quality:cpu-genetic']]],
  cpu_texture_optimize:[['python',['scripts/cpu_texture_factory.py','apps','.quality-generated/textures']]],
  cpu_mesh_audit:[['npm',['run','quality:mesh-scan']]],
  knowledge_learn:[['npm',['run','quality:knowledge-learn']]]
 };
 return map[job.task_kind]||[['npm',['run','quality:durable-cycle']]];
}
async function main(){
 if(!FORCE&&!inNightWindow()){console.log('[CPU_NIGHT] outside 00:00-08:00 Tbilisi; exit');return}
 if(!clean())throw new Error('World_server working tree is not clean; silent autopilot refuses to touch it');
 const usage=await cpuPercent();if(!FORCE&&usage>72){console.log(`[CPU_NIGHT] host busy ${usage.toFixed(1)}%; exit`);return}
 const claim=await api({action:'claim',worker,maxCpuSeconds:3600});const job=claim.job;if(!job){console.log('[CPU_NIGHT] queue empty');return}
 if(job.requires_gpu||Number(job.estimated_paid_cost||0)>0)throw new Error('forbidden GPU/paid job received');
 const before=quality(),base=run('git',['rev-parse','HEAD'],{capture:true}).stdout.trim();
 const branch=`ai/nightly/${new Date().toISOString().replace(/[:.]/g,'-')}-${job.id}`;
 let ok=true,error=null;
 try{
   let r=run('git',['switch','-c',branch]);if(r.status!==0)throw new Error('cannot create candidate branch');
   for(const [cmd,args] of commandFor(job)){r=run(cmd,args);if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed`)}
   r=run('npm',['run','release:gate']);if(r.status!==0)throw new Error('release gate failed');
   const after=quality();if(after+1e-9<before)throw new Error(`quality regressed ${before.toFixed(2)} -> ${after.toFixed(2)}`);
   const diff=run('git',['diff','--binary'],{capture:true}).stdout||'';
   const candidateDir=path.join(ROOT,'nightly-candidates');fs.mkdirSync(candidateDir,{recursive:true});
   const patch=path.join(candidateDir,`${job.id}-${job.task_kind}.patch`);if(diff.trim())fs.writeFileSync(patch,diff);
   await api({action:'complete',id:job.id,result:{branch,base,patch:diff.trim()?path.relative(ROOT,patch):null,qualityBefore:before,qualityAfter:after,requiresGpu:false,paidCost:0},learningEvent:{projectKey:job.project_key,fingerprint:job.task_payload?.fingerprint||crypto.createHash('sha1').update(job.project_key+job.task_kind).digest('hex').slice(0,16),actionKind:job.task_kind,systemArea:job.task_payload?.systemArea||null,qualityBefore:before,qualityAfter:after,qualityDelta:after-before,passedAllGates:true,outcome:{branch,patch:diff.trim()?path.relative(ROOT,patch):null}}});
   console.log(`[CPU_NIGHT] PASS ${job.project_key}/${job.task_kind}: ${before.toFixed(2)} -> ${after.toFixed(2)}`);
 }catch(e){
   ok=false;error=String(e.message||e);try{await api({action:'fail',id:job.id,result:{error,requiresGpu:false,paidCost:0},learningEvent:{projectKey:job.project_key,actionKind:job.task_kind,qualityBefore:before,qualityAfter:quality(),qualityDelta:quality()-before,passedAllGates:false,outcome:{error}}})}catch{}
   console.error('[CPU_NIGHT] FAIL',error);
 }finally{
   run('git',['reset','--hard',base]);run('git',['switch','-']);
   run('git',['branch','-D',branch]);
 }
 if(!ok)process.exitCode=1;
}
main().catch(e=>{console.error(e);process.exitCode=1});
