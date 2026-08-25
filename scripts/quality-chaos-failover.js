#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),http=require('http');
const {resilientFetch,fetchJson}=require('../lib/quality-resilient-fetch');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),cc=cfg.chaosFailover||{},results=[];
async function mockScenario(name,handler,test){
  const server=http.createServer(handler);await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok)});const port=server.address().port,started=Date.now();
  try{await test(`http://127.0.0.1:${port}`);results.push({scenario:name,pass:true,durationMs:Date.now()-started})}catch(e){results.push({scenario:name,pass:false,durationMs:Date.now()-started,error:String(e.message||e)})}finally{await new Promise(r=>server.close(r))}
}
(async()=>{
  let c=0;await mockScenario('transient-503',(req,res)=>{c++;res.statusCode=c<3?503:200;res.setHeader('content-type','application/json');res.end(JSON.stringify({ok:c>=3}))},async url=>{const x=await fetchJson(url,{retries:2,timeoutMs:800});if(!x.json.ok||x.attempts!==3)throw new Error(`expected recovery on attempt 3, got ${x.attempts}`)});
  await mockScenario('hard-503',(req,res)=>{res.statusCode=503;res.end('down')},async url=>{let failed=false;try{await resilientFetch(url,{retries:1,timeoutMs:500})}catch(_){failed=true}if(!failed)throw new Error('hard 503 did not fail closed')});
  await mockScenario('timeout',(req,res)=>setTimeout(()=>{res.statusCode=200;res.end('{}')},1500),async url=>{let failed=false;try{await resilientFetch(url,{retries:0,timeoutMs:250})}catch(_){failed=true}if(!failed)throw new Error('timeout did not fail closed')});
  await mockScenario('malformed-json',(req,res)=>{res.statusCode=200;res.end('{broken')},async url=>{let failed=false;try{await fetchJson(url,{retries:0,timeoutMs:500})}catch(e){failed=String(e.message).includes('malformed JSON')}if(!failed)throw new Error('malformed JSON was accepted')});
  const live=[];
  const base=(process.env.QUALITY_BASE_URL||cfg.productionBaseUrl||'').replace(/\/$/,'');try{const x=await resilientFetch(`${base}/api/apps`,{retries:1,timeoutMs:5000});live.push({target:'vercel',pass:x.response.ok,status:x.response.status,durationMs:x.durationMs})}catch(e){live.push({target:'vercel',pass:false,error:String(e.message||e)})}
  const supa=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';if(supa&&key){try{const x=await resilientFetch(`${supa}/rest/v1/quality_telemetry?select=id&limit=1`,{headers:{apikey:key,authorization:`Bearer ${key}`},retries:1,timeoutMs:5000});live.push({target:'supabase',pass:x.response.ok,status:x.response.status,durationMs:x.durationMs})}catch(e){live.push({target:'supabase',pass:false,error:String(e.message||e)})}}else live.push({target:'supabase',pass:true,status:'not-configured-in-this-run'});
  const ai=(process.env.AI3D_WORKER_URL||'').replace(/\/$/,'');if(ai){try{const x=await resilientFetch(`${ai}/health`,{retries:1,timeoutMs:5000});live.push({target:'ai3d-worker',pass:x.response.ok,status:x.response.status,durationMs:x.durationMs})}catch(e){live.push({target:'ai3d-worker',pass:false,optional:true,error:String(e.message||e)})}}else live.push({target:'ai3d-worker',pass:true,optional:true,status:'not-configured'});
  const isolatedPass=results.every(x=>x.pass),corePass=live.filter(x=>!x.optional&&x.status!=='not-configured-in-this-run').every(x=>x.pass),pass=isolatedPass&&corePass;
  const report={generatedAt:new Date().toISOString(),status:pass?'CHAOS_FAILOVER_PASS':'CHAOS_FAILOVER_FAIL',pass,mode:cc.mode||'non-destructive',isolatedScenarios:results,liveDependencyProbes:live,guarantee:'no faults injected into production traffic'};
  fs.writeFileSync(path.join(ROOT,'QUALITY_CHAOS_FAILOVER_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  if(supa&&key){for(const r of [...results,...live]){try{await fetch(`${supa}/rest/v1/quality_chaos_results`,{method:'POST',headers:{apikey:key,authorization:`Bearer ${key}`,'content-type':'application/json',prefer:'return=minimal'},body:JSON.stringify({scenario:r.scenario||'live-probe',target:r.target||'resilient-fetch',pass:Boolean(r.pass),latency_ms:Number(r.durationMs||0),evidence:r}),signal:AbortSignal.timeout(8000)})}catch(_){}}}
  console.log(`[QUALITY_CHAOS] pass=${pass} isolated=${results.length} live=${live.length}`);if(!pass)process.exit(128);
})().catch(e=>{fs.writeFileSync(path.join(ROOT,'QUALITY_CHAOS_FAILOVER_REPORT.json'),JSON.stringify({generatedAt:new Date().toISOString(),status:'CHAOS_HARNESS_ERROR',pass:false,error:String(e.message||e)},null,2)+'\n');console.error(e);process.exit(129)});
