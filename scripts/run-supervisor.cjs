[Reading 31 lines from start (total: 31 lines, 0 remaining)]

#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const ROOT=path.resolve(__dirname,'..');
const RUNTIME=path.join(ROOT,'data','collective-brain','runtime','run-supervisor');
const positive=(v,d)=>Number.isFinite(Number(v))&&Number(v)>0?Number(v):d;
const safe=v=>String(v||'run').replace(/[^a-zA-Z0-9_.-]+/g,'-').slice(0,96);
function save(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n')}
function append(file,value){fs.mkdirSync(path.dirname(file),{recursive:true});fs.appendFileSync(file,JSON.stringify(value)+'\n')}
function stopOwned(child){if(!child||child.exitCode!==null)return false;try{return child.kill('SIGTERM')}catch{return false}}
function supervise(command,args=[],options={}){
 const runId=safe(options.runId||('run-'+Date.now())),timeoutMs=positive(options.timeoutMs,120000);
 const stallMs=Math.min(positive(options.stallMs,30000),timeoutMs);
 const heartbeat=options.heartbeatPattern?new RegExp(options.heartbeatPattern):/./;
 const dir=path.join(RUNTIME,runId),statusFile=path.join(dir,'status.json'),events=path.join(dir,'events.jsonl');
 fs.mkdirSync(dir,{recursive:true});
 const started=Date.now();let lastProgress=started,lastSignal='spawn',settled=false,timedOut=false,stalled=false,child;
 const record=(state,extra={})=>{const value={schemaVersion:'1.0.0',runId,state,pid:child?.pid||null,command,args,startedAt:new Date(started).toISOString(),updatedAt:new Date().toISOString(),lastProgressAt:new Date(lastProgress).toISOString(),lastSignal,timeoutMs,stallMs,...extra};save(statusFile,value);append(events,value);return value};
 const progress=(stream,chunk)=>{const text=chunk.toString();fs.appendFileSync(path.join(dir,stream+'.log'),text);heartbeat.lastIndex=0;if(heartbeat.test(text)){lastProgress=Date.now();lastSignal=stream;record('RUNNING',{progress:true})}};
 return new Promise((resolve,reject)=>{
  child=spawn(command,args,{cwd:options.cwd||ROOT,env:{...process.env,...(options.env||{})},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});record('RUNNING');
  child.stdout.on('data',c=>progress('stdout',c));child.stderr.on('data',c=>progress('stderr',c));
  const monitor=setInterval(()=>{if(settled)return;const age=Date.now()-lastProgress,total=Date.now()-started;if(total>=timeoutMs){timedOut=true;record('TIMEOUT',{ageMs:age,totalMs:total});stopOwned(child)}else if(age>=stallMs){stalled=true;record('STALLED',{ageMs:age,totalMs:total});stopOwned(child)}},Math.min(1000,Math.max(100,Math.floor(stallMs/4))));
  child.on('error',error=>{if(settled)return;settled=true;clearInterval(monitor);reject(Object.assign(error,{result:record('ERROR',{error:error.message,durationMs:Date.now()-started})}))});
  child.on('exit',(code,signal)=>{if(settled)return;settled=true;clearInterval(monitor);const state=timedOut?'TIMEOUT':stalled?'STALLED':code===0?'PASS':'FAIL';resolve(record(state,{exitCode:code,signal,durationMs:Date.now()-started,checkpointPath:dir}))});
 });
}
function parseCli(argv){const opts={};const sep=argv.indexOf('--'),control=sep>=0?argv.slice(0,sep):argv,cmd=sep>=0?argv.slice(sep+1):[];for(let i=0;i<control.length;i++){const k=control[i];if(k==='--run-id')opts.runId=control[++i];else if(k==='--timeout-ms')opts.timeoutMs=Number(control[++i]);else if(k==='--stall-ms')opts.stallMs=Number(control[++i]);else if(k==='--heartbeat-regex')opts.heartbeatPattern=control[++i];else if(k==='--cwd')opts.cwd=control[++i];else throw new Error('unknown option: '+k)}if(!cmd.length)throw new Error('usage: run-supervisor.cjs [options] -- <command> [args...]');opts.command=cmd[0];opts.args=cmd.slice(1);return opts}
async function main(){const o=parseCli(process.argv.slice(2)),r=await supervise(o.command,o.args,o);console.log(JSON.stringify(r,null,2));process.exitCode=r.state==='PASS'?0:(r.state==='STALLED'||r.state==='TIMEOUT'?124:1)}
if(require.main===module)main().catch(e=>{console.error('[RUN_SUPERVISOR]',e.stack||e.message);process.exitCode=2});
module.exports={supervise,parseCli,stopOwned};

[executed on device: WIN-GJVRHRQPB5A (6cbaf64e-47f4-428e-98d3-70d3c05abcef)]