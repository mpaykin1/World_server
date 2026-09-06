#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
function evaluate(summary,budgets){
  const violations=[];let sessions=0;
  if(!summary||summary.ok!==true)return {sessions,violations:[{type:'summary-unavailable',error:summary?.error||'unavailable'}]};
  for(const [app,m] of Object.entries(summary.apps||{})){
    const b=budgets[app];if(!b||!m.sessions)continue;sessions+=Number(m.sessions||0);
    if(Number.isFinite(m.p10Fps)&&m.p10Fps<b.minimumFps)violations.push({type:'production-fps',app,observed:m.p10Fps,min:b.minimumFps});
    if(Number.isFinite(m.p95LoadMs)&&m.p95LoadMs>b.canvasVisibleMs+2500)violations.push({type:'production-load',app,observed:m.p95LoadMs,max:b.canvasVisibleMs+2500});
    if(Number(m.errors||0)>Math.max(3,Math.ceil(m.sessions*.05)))violations.push({type:'production-errors',app,errors:m.errors,sessions:m.sessions});
  }
  return {sessions,violations};
}
async function pull(base,hours){
  const r=await fetch(`${base}/api/quality-summary?hours=${hours}`,{signal:AbortSignal.timeout(20000)});
  const j=await r.json().catch(()=>({ok:false,error:'invalid json'}));
  if(!r.ok||j.ok!==true)return {ok:false,error:j.error||`HTTP ${r.status}`,status:r.status,apps:j.apps||{}};
  return j;
}
async function main(){
  const ROOT=process.cwd(),base=(process.env.QUALITY_BASE_URL||'https://world-server.vercel.app').replace(/\/$/,'');
  const budgets=JSON.parse(fs.readFileSync(path.join(ROOT,'data/performance-budgets.json'),'utf8')).budgets;
  const freshHours=Math.max(1,Number(process.env.QUALITY_FRESH_HOURS||1));
  const [fresh,history]=await Promise.all([pull(base,freshHours),pull(base,24)]);
  const freshEval=evaluate(fresh,budgets),historyEval=evaluate(history,budgets);
  let verdict='PASS',violations=freshEval.violations;
  if(freshEval.violations.length)verdict='BLOCK';
  else if(freshEval.sessions===0){verdict='INCONCLUSIVE';violations=[{type:'no-fresh-evidence',hours:freshHours}];}
  const report={generatedAt:new Date().toISOString(),base,freshHours,verdict,pass:verdict==='PASS',fresh:{summary:fresh,...freshEval},history24h:{summary:history,...historyEval},violations};
  fs.writeFileSync(path.join(ROOT,'PRODUCTION_QUALITY_REPORT.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`[PRODUCTION_QUALITY] verdict=${verdict} freshSessions=${freshEval.sessions} violations=${violations.length}`);
  if(verdict==='BLOCK')process.exitCode=23;else if(verdict==='INCONCLUSIVE')process.exitCode=24;
}
if(require.main===module)main().catch((error)=>{console.error('[PRODUCTION_QUALITY] fatal:',error);process.exitCode=1;});
module.exports={evaluate};
