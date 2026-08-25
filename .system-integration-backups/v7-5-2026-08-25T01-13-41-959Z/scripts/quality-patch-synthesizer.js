#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(),STRICT=process.env.QUALITY_PATCH_STRICT==='1';
const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/patch-synthesis-policy.json'),'utf8'));
const plan=fs.existsSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'),'utf8')):{tasks:[]};
const task=(plan.tasks||[])[0]||null;
const report={generatedAt:new Date().toISOString(),task,status:'NOT_RUN',candidate:null,verification:null};

function finish(code=0){
 fs.writeFileSync(path.join(ROOT,'QUALITY_PATCH_SYNTHESIS_REPORT.json'),JSON.stringify(report,null,2)+'\n');
 console.log(`[PATCH_SYNTH] ${report.status}`);process.exit(code);
}
if(!task){report.status='NO_TASK';finish(0)}
const endpoint=process.env.QUALITY_PATCH_MODEL_URL,token=process.env.QUALITY_PATCH_MODEL_TOKEN;
if(!endpoint){report.status='MODEL_NOT_CONFIGURED';finish(STRICT?30:0)}

const request={
  task,
  constraints:{
    output:'unified diff only',
    allowedPathPrefixes:policy.allowedPathPrefixes,
    forbiddenPaths:policy.forbiddenPaths,
    noRegression:true,
    minimalPatch:true,
    addOrUpdateTests:true
  }
};
let response;
try{
 const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(request),signal:AbortSignal.timeout(120000)});
 if(!r.ok)throw new Error(`model endpoint ${r.status}`);
 response=await r.json();
}catch(e){report.status='MODEL_ERROR';report.error=String(e.message||e);finish(STRICT?31:0)}
const diff=String(response.diff||response.patch||'');
if(!diff.startsWith('diff --git ')||Buffer.byteLength(diff)>policy.maxDiffBytes){
 report.status='INVALID_DIFF';finish(32);
}
const touched=[...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(m=>m[2]);
for(const f of touched){
 if(policy.forbiddenPaths.includes(f)||!policy.allowedPathPrefixes.some(x=>f.startsWith(x))){
   report.status='FORBIDDEN_PATH';report.forbidden=f;finish(33);
 }
}
report.candidate={bytes:Buffer.byteLength(diff),touched,diff};
fs.writeFileSync(path.join(ROOT,'QUALITY_PATCH_CANDIDATE.diff'),diff);

// Sandbox verification. Public repo clone keeps transfer simple and reproducible.
let Sandbox;
try{({Sandbox}=await import('@vercel/sandbox'))}catch(e){report.status='SANDBOX_SDK_NOT_INSTALLED';finish(STRICT?34:0)}
let sandbox;
try{
 const credentials={};
 if(process.env.VERCEL_TOKEN)credentials.token=process.env.VERCEL_TOKEN;
 if(process.env.VERCEL_TEAM_ID)credentials.teamId=process.env.VERCEL_TEAM_ID;
 if(process.env.VERCEL_PROJECT_ID)credentials.projectId=process.env.VERCEL_PROJECT_ID;
 sandbox=await Sandbox.create({...credentials,runtime:'node24',timeout:300000});
 const repo=process.env.QUALITY_REPO_URL||'https://github.com/mpaykin1/World_server.git';
 const base=process.env.QUALITY_PATCH_BASE_SHA||'master';
 const cmds=[
  ['git',['clone','--depth','50',repo,'repo']],
  ['git',['-C','repo','fetch','origin',base,'--depth','50']],
  ['git',['-C','repo','checkout',base]],
 ];
 for(const [cmd,args] of cmds){
  const r=await sandbox.runCommand(cmd,args);if(r.exitCode!==0)throw new Error(`${cmd} failed: ${await r.stderr()}`);
 }
 const b64=Buffer.from(diff).toString('base64');
 let r=await sandbox.runCommand('sh',['-lc',`echo '${b64}' | base64 -d > /tmp/candidate.diff && cd repo && git apply --check /tmp/candidate.diff && git apply /tmp/candidate.diff`]);
 if(r.exitCode!==0)throw new Error(`git apply failed: ${await r.stderr()}`);
 const verify=[
   'npm ci',
   'npm run release:gate',
   'node --test test/quality-regression.test.js test/golden-physics.test.js test/quality-growth.test.js test/quality-mutation.test.js test/quality-fuzz.test.js'
 ];
 const evidence=[];
 for(const command of verify){
  const x=await sandbox.runCommand('sh',['-lc',`cd repo && ${command}`]);
  const out=(await x.stdout()).slice(-10000),err=(await x.stderr()).slice(-10000);
  evidence.push({command,exitCode:x.exitCode,stdout:out,stderr:err});
  if(x.exitCode!==0)throw new Error(`verification failed: ${command}`);
 }
 report.status='VERIFIED_IN_SANDBOX';report.verification=evidence;
}catch(e){
 report.status='SANDBOX_VERIFICATION_FAILED';report.error=String(e.message||e);
}finally{
 try{await sandbox?.stop()}catch{}
}
finish(report.status==='VERIFIED_IN_SANDBOX'?0:(STRICT?35:0));
