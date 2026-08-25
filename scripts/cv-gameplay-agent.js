#!/usr/bin/env node
'use strict';

const fs=require('fs');
const path=require('path');
const cp=require('child_process');
const ROOT=process.cwd();
const endpoint=process.env.CV_AGENT_ENDPOINT;
const screenshot=process.env.CV_AGENT_SCREENSHOT || path.join(ROOT,'test-results','cv-agent','screen.png');
const out=path.join(ROOT,'CV_GAMEPLAY_AGENT_REPORT.json');
const requireProvider=process.argv.includes('--require');

async function main(){
  if(!endpoint){
    const r={schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_CONFIGURED',provider:null,reason:'Set CV_AGENT_ENDPOINT to a vision-action service. Runtime coordinates are intentionally not accepted as CV proof.'};
    fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
    console.log('[CV_GAMEPLAY_AGENT] NOT_CONFIGURED');
    if(requireProvider) process.exitCode=45;
    return;
  }
  if(!fs.existsSync(screenshot)){
    const r={schemaVersion:1,generatedAt:new Date().toISOString(),status:'NOT_VERIFIED',reason:`screenshot missing: ${screenshot}`};
    fs.writeFileSync(out,JSON.stringify(r,null,2)+'\n');
    if(requireProvider) process.exitCode=45;
    return;
  }
  const image=fs.readFileSync(screenshot);
  const response=await fetch(endpoint,{
    method:'POST',
    headers:{'content-type':'application/octet-stream','x-world-quality-contract':'vision-action-v1'},
    body:image
  });
  let result=null;
  try{result=await response.json();}catch{}
  const allowed=new Set(['forward','back','left','right','jump','look_left','look_right','look_up','look_down','interact','attack','wait']);
  const valid=response.ok && result && allowed.has(result.action) && Number(result.confidence)>=0 && Number(result.confidence)<=1;
  const report={schemaVersion:1,generatedAt:new Date().toISOString(),status:valid?'PASS':'FAIL',provider:endpoint,responseStatus:response.status,result};
  fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log(`[CV_GAMEPLAY_AGENT] ${report.status} action=${result?.action||'none'}`);
  if(!valid) process.exitCode=45;
}
main().catch(error=>{
  fs.writeFileSync(out,JSON.stringify({schemaVersion:1,generatedAt:new Date().toISOString(),status:'FAIL',error:String(error.stack||error)},null,2)+'\n');
  console.error('[CV_GAMEPLAY_AGENT] FAIL',error);
  process.exitCode=45;
});
