#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd(),cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data','quiet-quality-autopilot.json'),'utf8')),d=cfg.distributed||{};
const cmd=process.argv[2]||'acquire',stateDir=path.join(ROOT,'.quality-autopilot-state'),stateFile=path.join(stateDir,'distributed-lease.json');
const url=(process.env.SUPABASE_URL||'').replace(/\/$/,''),key=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const owner=String(process.env.QUALITY_AGENT_ID||process.env.GITHUB_RUN_ID||`local-${process.pid}`),leaseKey=process.env.QUALITY_LEASE_KEY||d.leaseKey||'world-server:quiet-quality-autopilot:improve';
function out(v){fs.mkdirSync(stateDir,{recursive:true});fs.writeFileSync(path.join(ROOT,'QUALITY_DISTRIBUTED_COORDINATOR.json'),JSON.stringify(v,null,2)+'\n');console.log(`[DISTRIBUTED] ${v.status}`)}
async function rpc(name,body){const r=await fetch(`${url}/rest/v1/rpc/${name}`,{method:'POST',headers:{'content-type':'application/json',apikey:key,authorization:`Bearer ${key}`},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error(`${name} ${r.status}: ${await r.text()}`);return r.json()}
(async()=>{
  if(!url||!key){if(cmd==='release'){out({status:'FALLBACK_LOCAL_RELEASED',released:true,reason:'Supabase secrets absent; GitHub concurrency/local lock is authoritative'});}else{out({status:'FALLBACK_LOCAL_LOCK_ONLY',acquired:true,reason:'Supabase secrets absent; GitHub concurrency/local lock is authoritative'});}return}
  if(cmd==='acquire'){
    const token=crypto.randomUUID();
    const j=await rpc('quality_autopilot_claim_lease',{p_key:leaseKey,p_owner:owner,p_token:token,p_ttl_seconds:Number(d.leaseTtlSeconds||7200),p_payload:{runId:process.env.GITHUB_RUN_ID||null,sha:process.env.GITHUB_SHA||null}});
    const acquired=j===true||Array.isArray(j)&&j[0]===true;
    const rec={status:acquired?'LEASE_ACQUIRED':'LEASE_BUSY',acquired,leaseKey,owner,token:acquired?token:null,at:new Date().toISOString()};
    if(acquired)fs.writeFileSync(stateFile,JSON.stringify(rec,null,2)+'\n');out(rec);return;
  }
  if(cmd==='release'){
    let s={};try{s=JSON.parse(fs.readFileSync(stateFile,'utf8'))}catch(_){}
    if(!s.token){out({status:'NO_LEASE_TO_RELEASE',released:true});return}
    const j=await rpc('quality_autopilot_release_lease',{p_key:s.leaseKey||leaseKey,p_owner:s.owner||owner,p_token:s.token});
    const released=j===true||Array.isArray(j)&&j[0]===true;try{fs.unlinkSync(stateFile)}catch(_){}out({status:released?'LEASE_RELEASED':'LEASE_RELEASE_NOT_OWNER',released});return;
  }
  throw new Error(`unknown command ${cmd}`);
})().catch(e=>{out({status:'DISTRIBUTED_ERROR',acquired:false,error:String(e.message||e)});process.exit(73)});
