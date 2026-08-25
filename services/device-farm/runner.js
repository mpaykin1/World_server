#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const ROOT=process.cwd();
const out=path.join(ROOT,'DEVICE_FARM_REPORT.json');
const requireProvider=process.argv.includes('--require');
const raw=process.env.REAL_DEVICE_ENDPOINTS_JSON;

async function main(){
  if(!raw){
    const r={schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_CONFIGURED',devices:[],reason:'REAL_DEVICE_ENDPOINTS_JSON not configured'};
    fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
    console.log('[DEVICE_FARM] NOT_CONFIGURED');
    if(requireProvider) process.exitCode=46;
    return;
  }
  let devices;
  try{devices=JSON.parse(raw);}catch{throw new Error('REAL_DEVICE_ENDPOINTS_JSON must be valid JSON array');}
  if(!Array.isArray(devices)||!devices.length) throw new Error('REAL_DEVICE_ENDPOINTS_JSON must contain at least one device');
  const results=[];
  for(const d of devices){
    const started=Date.now();
    try{
      const r=await fetch(d.healthUrl,{headers:d.token?{authorization:`Bearer ${d.token}`}:{}}); 
      results.push({id:d.id,platform:d.platform,status:r.ok?'PASS':'FAIL',httpStatus:r.status,latencyMs:Date.now()-started});
    }catch(error){results.push({id:d.id,platform:d.platform,status:'FAIL',error:String(error.message||error),latencyMs:Date.now()-started});}
  }
  const status=results.every(x=>x.status==='PASS')?'PASS':'FAIL';
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),status,devices:results};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(`[DEVICE_FARM] ${status} ${results.filter(x=>x.status==='PASS').length}/${results.length}`);
  if(status!=='PASS') process.exitCode=46;
}
main().catch(error=>{
  fs.writeFileSync(out,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),status:'FAIL',error:String(error.stack||error)},null,2)+'\n');
  console.error('[DEVICE_FARM] FAIL',error);
  process.exitCode=46;
});
