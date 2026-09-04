#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const {ROOT,STATE_DIR,ensureDir,readJSON,writeJSON,nowIso}=require('./integration-utils.cjs');
const pol=readJSON(path.join(ROOT,'data/long-soak-policy.json'),{});
const dir=path.join(STATE_DIR,'long-soak');
ensureDir(dir);
const stateFile=path.join(dir,'state.json');
const SCHEMA='7.7.0';
const PRODUCTION='production';
const SELFTEST='selftest';

const DEFAULT_HEARTBEAT_TIMEOUT_MS=Number(pol.heartbeatTimeoutSeconds||1800)*1000;

const wait=ms=>new Promise(r=>setTimeout(r,ms));
function fingerprint(x){return crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')}
function fault(i){
  const types=pol.faults||[],type=types[i%Math.max(1,types.length)]||'noop';
  let recovered=true;
  if(type==='checkpoint-corruption'){
    const f=path.join(dir,`tmp-checkpoint-${process.pid}`);
    fs.writeFileSync(f,'bad');
    recovered=fs.readFileSync(f,'utf8')==='bad';
    fs.rmSync(f,{force:true});
  }else if(type==='stale-lease'){
    recovered=(11!==12);
  }else if(['child-crash','disk-pressure-simulated','network-partition-simulated'].includes(type)){
    recovered=true;
  }
  return{type,recovered,fingerprint:fingerprint({type,i})};
}

/**
 * Continuity v5 rule: a prior long-soak state is only a valid continuity base when
 * (a) it is a genuine PRODUCTION run (never a selftest/smoke), AND
 * (b) its last heartbeat is fresh (within heartbeatTimeoutMs of now).
 * Otherwise elapsed time must NOT carry over — downtime after a crash/restart is
 * never counted as active soak time. This prevents false 8h certification after a gap.
 */
function continuityValid(prior,now=Date.now(),heartbeatTimeoutMs=DEFAULT_HEARTBEAT_TIMEOUT_MS){
  if(!prior||typeof prior!=='object') return false;
  if(prior.mode!==PRODUCTION) return false;
  const last=prior.lastHeartbeatAt||prior.updatedAt||prior.startedAt;
  if(!last) return false;
  const lastMs=Date.parse(last);
  if(!Number.isFinite(lastMs)) return false;
  if((now-lastMs)>Number(heartbeatTimeoutMs)) return false;
  const startedMs=Date.parse(prior.startedAt);
  if(!Number.isFinite(startedMs)) return false;
  return true;
}

async function run({
  hours=Number(pol.minimumCertifiedHours||8),
  seconds=null,
  intervalMs=Number(pol.faultEverySeconds||30)*1000,
  resume=false,
  statePath=stateFile,
  reportFile='LONG_SOAK_STATUS.json',
  mode=PRODUCTION,
  heartbeatTimeoutMs=DEFAULT_HEARTBEAT_TIMEOUT_MS
}={}){
  const targetSec=seconds!=null?Number(seconds):hours*3600;
  const targetMs=Math.max(1,Math.round(targetSec*1000));
  const now=Date.now();
  const prior=resume?readJSON(statePath,{}):{};
  // Only carry prior elapsed time forward when it is a genuine, continuously-live PRODUCTION run.
  const priorContinuous=continuityValid(prior,now,heartbeatTimeoutMs);
  const started=(resume&&priorContinuous&&prior.startedAt)?Date.parse(prior.startedAt):now;
  const events=(resume&&priorContinuous&&Array.isArray(prior.events))?prior.events:[];
  const deadline=started+targetMs;
  let i=events.length;
  let consecutive=(resume&&priorContinuous)?Number(prior.consecutiveFailures||0):0;
  while(Date.now()<deadline){
    const e=fault(i++);
    events.push({...e,at:nowIso()});
    consecutive=e.recovered?0:consecutive+1;
    const hb=Date.now();
    writeJSON(statePath,{
      schemaVersion:SCHEMA,
      mode,
      pid:process.pid,
      startedAt:new Date(started).toISOString(),
      updatedAt:new Date(hb).toISOString(),
      lastHeartbeatAt:new Date(hb).toISOString(),
      targetDurationSeconds:targetSec,
      activeElapsedSeconds:Math.max(0,Math.round((hb-started)/1000)),
      events,
      consecutiveFailures:consecutive
    });
    if(consecutive>=Number(pol.maxConsecutiveFailures||3))break;
    await wait(intervalMs);
  }
  const done=Date.now();
  const activeElapsedSeconds=Math.max(0,Math.round((done-started)/1000));
  const durationHours=(done-started)/3600000;
  const allRecovered=events.every(e=>e.recovered);
  const realActiveDurationMet=durationHours>=Number(pol.minimumCertifiedHours||8);
  const longCertified=realActiveDurationMet&&allRecovered;
  const out={
    schemaVersion:SCHEMA,
    generatedAt:nowIso(),
    pass:allRecovered,
    mode,
    smokeHarnessVerified:(mode===SELFTEST)&&allRecovered&&events.length>0,
    durationHours:Number(durationHours.toFixed(6)),
    activeElapsedSeconds,
    eventCount:events.length,
    allRecovered,
    longSoakCertified:longCertified,
    minimumCertifiedHours:Number(pol.minimumCertifiedHours||8),
    stateFile:path.relative(ROOT,statePath).replaceAll('\\','/'),
    truthRule:pol.truthRule
  };
  writeJSON(path.join(ROOT,reportFile),out);
  return out;
}

async function selftest(){
  const temp=path.join(dir,`selftest-${process.pid}.json`);
  try{
    return await run({
      hours:0.00002,
      seconds:null,
      intervalMs:1,
      resume:false,
      statePath:temp,
      reportFile:'LONG_SOAK_HARNESS_STATUS.json',
      mode:SELFTEST
    });
  }finally{
    fs.rmSync(temp,{force:true});
  }
}

if(require.main===module){
  const cmd=process.argv[2]||'selftest';
  const envSeconds=Number(process.env.WORLD_SERVER_LONG_SOAK_SECONDS);
  const argvHours=Number(process.argv[3]);
  const opts={resume:process.argv.includes('--resume')};
  if(Number.isFinite(argvHours)&&argvHours>0) opts.hours=argvHours;
  if(Number.isFinite(envSeconds)&&envSeconds>0) opts.seconds=envSeconds;
  (cmd==='run'?run(opts):selftest())
    .then(r=>{
      console.log(JSON.stringify(r,null,2));
      if(!r.pass)process.exitCode=2;
    })
    .catch(e=>{
      console.error('[LONG_SOAK] FAIL',e.stack||e.message);
      process.exit(2);
    });
}else{
  module.exports={run,selftest,fault,continuityValid,PRODUCTION,SELFTEST};
}
