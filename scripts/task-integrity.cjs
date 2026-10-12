#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const MARK = '[TASK_INTEGRITY_EVENT_V1]';
const ALERT = '[TASK_INTEGRITY_ALERT_V1]';
const LANES = ['CLEAN_SERVER', 'GRAPHICS-DEMO-001'];
const KINDS = new Set(['code','playable','fix','pr_closed','regression']);
const WINDOW_MS = 4 * 60 * 60 * 1000;

function parseEvents(comments, now = Date.now()) {
  const valid = [], invalid = [], seen = new Set();
  for (const c of comments) {
    if (!String(c.body || '').trimStart().startsWith(MARK)) continue;
    if (!['OWNER','COLLABORATOR','MEMBER'].includes(String(c.author_association || ''))) continue;
    let e;
    try { e = JSON.parse(String(c.body).trimStart().slice(MARK.length).trim()); }
    catch { invalid.push({id:c.id,reason:'BAD_JSON'}); continue; }
    const start=Date.parse(e.started_at), end=Date.parse(e.finished_at);
    const posted=Date.parse(c.created_at), minutes=Number(e.productive_minutes);
    if (Number.isFinite(end) && end < now - WINDOW_MS) continue;
    const reference = String(e.evidence_ref || '');
    const reason = !LANES.includes(e.lane) ? 'BAD_LANE'
      : !/^[a-z0-9_.:-]{8,120}$/i.test(String(e.id || '')) ? 'BAD_ID'
      : !KINDS.has(e.kind) ? 'NOT_IMPLEMENTATION'
      : !Number.isFinite(start)||!Number.isFinite(end)||start>end
        ||end>now+60000||end<now-WINDOW_MS ? 'BAD_INTERVAL'
      : !Number.isFinite(posted)||posted<end-60000||posted>end+30*60000 ? 'STALE_ATTESTATION'
      : !Number.isInteger(minutes)||minutes<1||minutes>60
        ||minutes>Math.ceil((end-start)/60000)+1 ? 'BAD_MINUTES'
      : !/^(https:\/\/|library:)/.test(reference)
        ||/github\.com\/mpaykin1\/World_server\/issues\/80(?:$|[?#])/.test(reference)
        ||!/^[0-9a-f]{40}([0-9a-f]{24})?$/i.test(String(e.evidence_sha||''))
        ? 'MISSING_ARTIFACT' : null;
    if (reason) {invalid.push({id:c.id,reason});continue;}
    if(seen.has(e.id)){invalid.push({id:c.id,reason:'DUPLICATE'});continue;}
    seen.add(e.id);
    valid.push({...e, minutes, finished_ms:end});
  }
  return {valid,invalid};
}

function evaluate(comments, now=Date.now()) {
  const parsed=parseEvents(comments,now), events=parsed.valid;
  const mins=Object.fromEntries(LANES.map(lane=>[lane,
    events.filter(e=>e.lane===lane).reduce((sum,e)=>sum+e.minutes,0)]));
  const total=mins.CLEAN_SERVER+mins['GRAPHICS-DEMO-001'], expected=total/2;
  const latest=Object.fromEntries(LANES.map(lane=>[lane,
    events.filter(e=>e.lane===lane).sort((a,b)=>b.finished_ms-a.finished_ms)[0]||null]));
  const starved=LANES.filter(lane=>!latest[lane]||latest[lane].finished_ms<now-2*3600000);
  const status=parsed.invalid.length?'INVALID_TELEMETRY':!total?'NO_TELEMETRY':
    starved.length?'TASK_STARVATION':
    Math.abs(mins.CLEAN_SERVER-mins['GRAPHICS-DEMO-001'])>1?'MISSED_QUOTA':
    'TELEMETRY_BALANCED_UNVERIFIED';
  return {status,ok:status==='TELEMETRY_BALANCED_UNVERIFIED',
    target:{CLEAN_SERVER:50,'GRAPHICS-DEMO-001':50},window_hours:4,
    actual_minutes:mins,expected_minutes_each:expected,
    debt_minutes:Object.fromEntries(LANES.map(lane=>[lane,Math.max(0,expected-mins[lane])])),
    starved, rejected:parsed.invalid, accepted_events:events.length,
    independent_fleet_visual_score:'UNKNOWN',owner_verdict:'UNSET',
    latest_artifacts:Object.fromEntries(LANES.map(lane=>[lane,latest[lane]?
      {id:latest[lane].id,ref:latest[lane].evidence_ref,sha:latest[lane].evidence_sha}:null]))};
}

async function api(path,token,init={}) {
  const response=await fetch('https://api.github.com'+path,{
    ...init, headers:{Accept:'application/vnd.github+json',
      Authorization:'Bearer '+token,'User-Agent':'world-server-task-integrity',
      'X-GitHub-Api-Version':'2022-11-28',...(init.headers||{})},
    signal:AbortSignal.timeout(12000)});
  if(!response.ok) throw Error('GitHub API '+response.status+' on '+path);
  return response.json();
}
async function comments(token,now){
  const since=encodeURIComponent(new Date(now-WINDOW_MS-3600000).toISOString());
  const all=[];
  for(let page=1;page<=10;page++){
    const rows=await api('/repos/mpaykin1/World_server/issues/80/comments?per_page=100&page='
      +page+'&since='+since,token);
    if(!Array.isArray(rows)) throw Error('Malformed comments API response');
    all.push(...rows);
    if(rows.length<100)return all;
  }
  throw Error('Comments pagination exceeded safe bound');
}
async function alertIfDue(rows,result,token,now){
  if(result.ok)return;
  const latest=Math.max(0,...rows.filter(c=>String(c.body||'').startsWith(ALERT))
    .map(c=>Date.parse(c.created_at)).filter(Number.isFinite));
  if(latest>now-WINDOW_MS)return;
  await api('/repos/mpaykin1/World_server/issues/80/comments',token,{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({body:ALERT+'\n'+result.status+'\nActual productive minutes: '
      +JSON.stringify(result.actual_minutes)+'\nDebt minutes: '
      +JSON.stringify(result.debt_minutes)
      +'\nTelemetry alarm ONLY, never user PASS/FAIL. Close tails and progress actual graphics.'})});
}
async function main(){
  if(!process.argv.includes('--monitor'))throw Error('Use --monitor, or node --test');
  if(!process.env.GH_TOKEN)throw Error('GH_TOKEN missing; no verification possible');
  const now=Date.now(), rows=await comments(process.env.GH_TOKEN,now);
  const result=evaluate(rows,now), json=JSON.stringify(result,null,2);
  console.log(json);
  if(process.env.GITHUB_STEP_SUMMARY)fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    '\n### 50/50 task execution audit\n\n'+String.fromCharCode(96).repeat(3)
    +'json\n'+json+'\n'+String.fromCharCode(96).repeat(3)+'\n');
  if(process.env.GITHUB_EVENT_NAME==='schedule')
    await alertIfDue(rows,result,process.env.GH_TOKEN,now);
  if(!result.ok)process.exitCode=73;
}
module.exports={parseEvents,evaluate,alertIfDue};
if(require.main===module)main().catch(e=>{
  console.error('[TASK_INTEGRITY] FAIL CLOSED:',e.message);process.exitCode=73;
});
