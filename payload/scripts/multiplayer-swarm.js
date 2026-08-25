#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const cp = require('child_process');

const ROOT=process.cwd();
const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'data/swarm-profiles.json'),'utf8'));
const size=Number(process.env.SWARM_SIZE || process.argv.find(x=>x.startsWith('--size='))?.split('=')[1] || cfg.defaultSize);
const requireTrueMultiplayer=process.argv.includes('--require-true-multiplayer');
const outPath=path.join(ROOT,'MULTIPLAYER_SWARM_REPORT.json');

function freePort(){return new Promise((resolve,reject)=>{const s=http.createServer();s.on('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(e=>e?reject(e):resolve(p));});});}
function sleep(ms){return new Promise(r=>setTimeout(r,ms));}
async function main(){
  const adapter=process.env.SWARM_ADAPTER_MODULE;
  if(adapter){
    const mod=require(path.resolve(ROOT,adapter));
    if(typeof mod.runSwarm!=='function') throw new Error('SWARM_ADAPTER_MODULE must export runSwarm(options)');
    const result=await mod.runSwarm({size,durationMs:cfg.durationMs});
    const report={schemaVersion:1,generatedAt:new Date().toISOString(),mode:'true-multiplayer-adapter',status:result.status||'FAIL',size,result};
    fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
    console.log(`[MULTIPLAYER_SWARM] ${report.status} true-multiplayer size=${size}`);
    if(report.status!=='PASS') process.exitCode=44;
    return;
  }

  const port=await freePort();
  const child=cp.spawn(process.execPath,[path.join(ROOT,'server.js')],{cwd:ROOT,env:{...process.env,PORT:String(port)},stdio:'ignore'});
  const base=`http://127.0.0.1:${port}`;
  let ready=false;
  for(let i=0;i<60;i++){try{const r=await fetch(base+'/api/apps');if(r.status===200){ready=true;break;}}catch{} await sleep(100);}
  if(!ready){child.kill();throw new Error('server did not start');}

  const started=Date.now();
  const clients=Array.from({length:size},(_,id)=>(async()=>{
    let ok=0,fail=0;
    while(Date.now()-started<cfg.durationMs){
      try{
        const r=await fetch(base+(id%2?'/api/apps':'/apps/ai3d-voxel-city/'));
        r.status===200?ok++:fail++;
      }catch{fail++;}
      await sleep(cfg.thinkTimeMs);
    }
    return {id,ok,fail};
  })());
  const results=await Promise.all(clients);
  child.kill();
  const ok=results.reduce((a,x)=>a+x.ok,0),fail=results.reduce((a,x)=>a+x.fail,0);
  const availability=ok/Math.max(1,ok+fail);
  const report={
    schemaVersion:1,generatedAt:new Date().toISOString(),
    mode:'transport-swarm-not-game-state',
    status:availability>=cfg.minimumAvailability?'PARTIAL':'FAIL',
    size,availability,results,
    blocker:'True multiplayer gameplay requires SWARM_ADAPTER_MODULE connected to the actual Realtime/game-state protocol.'
  };
  fs.writeFileSync(outPath,JSON.stringify(report,null,2)+'\n');
  console.log(`[MULTIPLAYER_SWARM] ${report.status} transport availability=${(availability*100).toFixed(1)}% size=${size}`);
  if(report.status==='FAIL'||requireTrueMultiplayer) process.exitCode=44;
}
main().catch(error=>{
  fs.writeFileSync(outPath,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),status:'FAIL',error:String(error.stack||error)},null,2)+'\n');
  console.error('[MULTIPLAYER_SWARM] FAIL', error);
  process.exitCode=44;
});
