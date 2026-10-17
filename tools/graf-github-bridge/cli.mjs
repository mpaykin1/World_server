#!/usr/bin/env node
// CLI for local operators and automation agents.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
const base=(process.env.BRIDGE_URL||'http://127.0.0.1:8765').replace(/\/$/,'');
const token=process.env.BRIDGE_API_TOKEN;
if(!token){console.error('BRIDGE_API_TOKEN not set');process.exit(2)}
const [cmd,...args]=process.argv.slice(2);
async function api(path,method='GET',body,key){
  const response=await fetch(`${base}${path}`,{method,headers:{
    authorization:`Bearer ${token}`,'content-type':'application/json',...(key?{'Idempotency-Key':key}:{})
  }, ...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(30000)});
  const txt=await response.text();let json;try{json=JSON.parse(txt)}catch{json={response:txt}};
  console.log(JSON.stringify(json,null,2));
  if(!response.ok)process.exitCode=1;
}
try{
  if(cmd==='submit'){
    if(!args[0])throw new Error('Usage: node cli.mjs submit job.json stable-idempotency-key');
    // Random idempotency key protects retries of this command only when caller saves it.
    const key=args[1];if(!key)throw new Error('Provide stable idempotency key; retries must reuse it');
    await api('/v1/jobs','POST',JSON.parse(readFileSync(args[0],'utf8')),key);
  }else if(cmd==='status'&&args[0]) await api(`/v1/jobs/${encodeURIComponent(args[0])}`);
  else if(cmd==='list')await api('/v1/jobs');
  else if(cmd==='diagnostics'&&args[0])await api('/v1/diagnostics','POST',{repo:args[0]});
  else throw new Error('Commands: submit job.json stable-key | status JOB_ID | list | diagnostics owner/repo');
}catch(e){console.error(e.message);process.exitCode=1}
