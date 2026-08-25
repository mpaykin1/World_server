#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT = process.cwd();
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/network-chaos-profiles.json'), 'utf8'));
const profileName = process.env.CHAOS_PROFILE || process.argv.find(x => x.startsWith('--profile='))?.split('=')[1] || 'mobile-poor';
const profile = cfg.profiles[profileName];
const outPath = path.join(ROOT, 'NETWORK_CHAOS_REPORT.json');
if (!profile) throw new Error(`Unknown chaos profile: ${profileName}`);

function delay(ms){ return new Promise(r=>setTimeout(r,ms)); }
function freePort(){ return new Promise((resolve,reject)=>{ const s=http.createServer(); s.on('error',reject); s.listen(0,'127.0.0.1',()=>{ const p=s.address().port; s.close(e=>e?reject(e):resolve(p)); }); }); }
async function main(){
  const port = await freePort();
  const child = cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<60;i++){
    try{ const r=await fetch(base+'/api/apps'); if(r.status===200){ready=true;break;} }catch{}
    await delay(100);
  }
  if(!ready){ child.kill(); throw new Error('server did not start'); }

  const samples=[];
  for(let i=0;i<profile.requests;i++){
    const injectedDrop = ((i * 37) % 1000) / 1000 < profile.dropRate;
    const jitter = ((i * 53) % Math.max(1, profile.jitterMs * 2 + 1)) - profile.jitterMs;
    const latency = Math.max(0, profile.latencyMs + jitter);
    const start=Date.now();
    await delay(latency);
    if(injectedDrop){ samples.push({ok:false,injectedDrop:true,latencyMs:Date.now()-start}); continue; }
    try{
      const r=await fetch(base+(i%3===0?'/apps/ai3d-voxel-city/':'/api/apps'));
      samples.push({ok:r.status===200,status:r.status,injectedDrop:false,latencyMs:Date.now()-start});
    }catch(error){ samples.push({ok:false,error:String(error.message||error),injectedDrop:false,latencyMs:Date.now()-start}); }
  }
  child.kill();

  const nonDropped=samples.filter(x=>!x.injectedDrop);
  const serviceFailures=nonDropped.filter(x=>!x.ok);
  const availability=nonDropped.length ? 1-serviceFailures.length/nonDropped.length : 0;
  const status=availability >= profile.minimumServiceAvailability ? 'PASS':'FAIL';
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),profile:profileName,status,availability,samples};
  fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
  console.log(`[NETWORK_CHAOS] ${status} availability=${(availability*100).toFixed(1)}% profile=${profileName}`);
  if(status==='FAIL') process.exitCode=43;
}
main().catch(error=>{
  fs.writeFileSync(outPath,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),profile:profileName,status:'FAIL',error:String(error.stack||error)},null,2)+'\n');
  console.error('[NETWORK_CHAOS] FAIL', error);
  process.exitCode=43;
});
