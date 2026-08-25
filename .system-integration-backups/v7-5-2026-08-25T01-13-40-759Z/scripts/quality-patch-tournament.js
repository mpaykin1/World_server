#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
async function main(){
 const ROOT=process.cwd(),STRICT=process.env.QUALITY_TOURNAMENT_STRICT==='1';
 const policy=JSON.parse(fs.readFileSync(path.join(ROOT,'data/patch-tournament-policy.json'),'utf8'));
 const plan=fs.existsSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'QUALITY_IMPROVEMENT_PLAN.json'),'utf8')):{tasks:[]};
 const task=(plan.tasks||[])[0]||null,endpoint=process.env.QUALITY_PATCH_MODEL_URL,token=process.env.QUALITY_PATCH_MODEL_TOKEN;
 const out={generatedAt:new Date().toISOString(),task,status:'NOT_RUN',candidates:[],winner:null};
 const save=(code=0)=>{fs.writeFileSync(path.join(ROOT,'QUALITY_PATCH_TOURNAMENT.json'),JSON.stringify(out,null,2)+'\n');console.log(`[PATCH_TOURNAMENT] ${out.status}`);process.exitCode=code};
 if(!task){out.status='NO_TASK';return save(0)}
 if(!endpoint){out.status='MODEL_NOT_CONFIGURED';return save(STRICT?40:0)}
 let Sandbox;
 try{({Sandbox}=await import('@vercel/sandbox'))}catch(e){out.status='SANDBOX_SDK_NOT_INSTALLED';return save(STRICT?41:0)}
 const synth=JSON.parse(fs.readFileSync(path.join(ROOT,'data/patch-synthesis-policy.json'),'utf8'));
 const validate=diff=>{
   if(!diff.startsWith('diff --git ')||Buffer.byteLength(diff)>synth.maxDiffBytes)return {ok:false,reason:'invalid-format-size'};
   const touched=[...diff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm)].map(m=>m[2]);
   for(const f of touched)if(synth.forbiddenPaths.includes(f)||!synth.allowedPathPrefixes.some(x=>f.startsWith(x)))return {ok:false,reason:`forbidden:${f}`,touched};
   return {ok:true,touched};
 };
 async function ask(role,index){
   const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify({task,role,index,constraints:{output:'unified diff only',minimalPatch:true,noRegression:true,testsRequired:true}}),signal:AbortSignal.timeout(120000)});
   if(!r.ok)throw new Error(`model ${r.status}`);const j=await r.json();return String(j.diff||j.patch||'');
 }
 async function verify(diff,index,role){
   const v=validate(diff),c={index,role,bytes:Buffer.byteLength(diff),touched:v.touched||[],verified:false,score:-1e9};
   if(!v.ok){c.reason=v.reason;return c}
   let sb;
   try{
     const cred={};if(process.env.VERCEL_TOKEN)cred.token=process.env.VERCEL_TOKEN;if(process.env.VERCEL_TEAM_ID)cred.teamId=process.env.VERCEL_TEAM_ID;if(process.env.VERCEL_PROJECT_ID)cred.projectId=process.env.VERCEL_PROJECT_ID;
     sb=await Sandbox.create({...cred,runtime:'node24',timeout:300000});
     const repo=process.env.QUALITY_REPO_URL||'https://github.com/mpaykin1/World_server.git',base=process.env.QUALITY_PATCH_BASE_SHA||'master';
     for(const [cmd,args] of [['git',['clone','--depth','50',repo,'repo']],['git',['-C','repo','checkout',base]]]){const x=await sb.runCommand(cmd,args);if(x.exitCode!==0)throw new Error(await x.stderr())}
     const b64=Buffer.from(diff).toString('base64');
     let x=await sb.runCommand('sh',['-lc',`echo '${b64}'|base64 -d >/tmp/p.diff && cd repo && git apply --check /tmp/p.diff && git apply /tmp/p.diff`]);if(x.exitCode!==0)throw new Error(await x.stderr());
     for(const command of ['npm ci','npm run release:gate','node --test test/quality-fuzz.test.js']){x=await sb.runCommand('sh',['-lc',`cd repo && ${command}`]);if(x.exitCode!==0)throw new Error(`${command}: ${await x.stderr()}`)}
     c.verified=true;const kb=c.bytes/1024,blast=c.touched.length+c.touched.filter(f=>f.startsWith('shared/')).length*4;c.score=Math.round((1500-kb*2-blast*5)*100)/100;
   }catch(e){c.reason=String(e.message||e)}finally{try{await sb?.stop()}catch{}}
   return c;
 }
 for(let i=0;i<policy.candidateCount;i++){const role=policy.roles[i%policy.roles.length];try{const diff=await ask(role,i),c=await verify(diff,i,role);c.diffSha256=crypto.createHash('sha256').update(diff).digest('hex');if(c.verified)c.diff=diff;out.candidates.push(c)}catch(e){out.candidates.push({index:i,role,verified:false,score:-1e9,reason:String(e.message||e)})}}
 const verified=out.candidates.filter(c=>c.verified).sort((a,b)=>b.score-a.score);
 if(!verified.length){out.status='NO_VERIFIED_CANDIDATE';return save(STRICT?42:0)}
 out.winner=verified[0];out.status='VERIFIED_WINNER';fs.writeFileSync(path.join(ROOT,'QUALITY_PATCH_WINNER.diff'),out.winner.diff);save(0);
}
main().catch(e=>{console.error(e);process.exitCode=1});
