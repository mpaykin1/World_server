#!/usr/bin/env node
'use strict';
const base=(process.env.QUALITY_BASE_URL||'').replace(/\/$/,'');
if(!base)throw new Error('QUALITY_BASE_URL required');
const paths=['/api/apps','/apps/catalog/','/apps/voxel-world/','/apps/ai3d-voxel-city/'];
const failures=[];
for(const path of paths){
  const started=Date.now();
  try{
    const r=await fetch(base+path,{redirect:'follow',signal:AbortSignal.timeout(15000)});
    const text=await r.text();
    const ms=Date.now()-started;
    if(!r.ok)failures.push({path,status:r.status,ms});
    else if(/Internal Server Error/i.test(text))failures.push({path,status:r.status,ms,reason:'Internal Server Error body'});
    else console.log(`[POST_DEPLOY_SMOKE] ${path} ${r.status} ${ms}ms`);
  }catch(e){failures.push({path,error:String(e.message||e)})}
}
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(20)}
console.log('[POST_DEPLOY_SMOKE] PASS');
