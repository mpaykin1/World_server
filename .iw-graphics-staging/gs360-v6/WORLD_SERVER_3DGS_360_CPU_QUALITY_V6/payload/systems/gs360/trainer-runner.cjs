#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const here = __dirname;
const argv = process.argv.slice(2);
function arg(name, fallback=null){const i=argv.indexOf(name);return i>=0&&i+1<argv.length?argv[i+1]:fallback;}
function flag(name){return argv.includes(name);}
function load(file,fallback={}){try{return JSON.parse(fs.readFileSync(file,'utf8'));}catch{return fallback;}}
function save(file,obj){fs.mkdirSync(path.dirname(file),{recursive:true});const t=file+'.tmp';fs.writeFileSync(t,JSON.stringify(obj,null,2)+'\n');fs.renameSync(t,file);}
function run(cmd,args,opts={}){const started=Date.now();const r=spawnSync(cmd,args,{encoding:'utf8',cwd:opts.cwd||process.cwd(),shell:!!opts.shell,timeout:opts.timeout||0});return{pass:r.status===0,status:r.status,elapsedSeconds:Math.round((Date.now()-started)/100)/10,stdoutTail:(r.stdout||'').slice(-6000),stderrTail:(r.stderr||'').slice(-6000)};}
function copyOrLink(src,dst){fs.mkdirSync(path.dirname(dst),{recursive:true});try{fs.linkSync(src,dst);}catch{fs.copyFileSync(src,dst);}}
function copyTree(src,dst){fs.mkdirSync(dst,{recursive:true});for(const e of fs.readdirSync(src,{withFileTypes:true})){const s=path.join(src,e.name),d=path.join(dst,e.name);if(e.isDirectory())copyTree(s,d);else copyOrLink(s,d);}}
function formatTemplate(tpl,vars){return tpl.replace(/\{(input|output|manifest)\}/g,(_,k)=>vars[k]);}

const outputArg=arg('--output');
if(!outputArg){console.error('[GS360 TRAINER] missing --output');process.exit(2);}
const output=path.resolve(outputArg);
const manifestPath=path.join(output,'GS360_MANIFEST.json');
const manifest=load(manifestPath,null);
if(!manifest){console.error('[GS360 TRAINER] manifest missing');process.exit(3);}
const reportPath=path.join(output,'GS360_TRAINER_REPORT.json');
if(manifest?.quality_contract?.trained_3dgs && !flag('--force')){
  const report={schema:'world-server.gs360-trainer/v3',pass:true,status:'ALREADY_TRAINED',backend:manifest?.backend?.kind||'existing',output};save(reportPath,report);console.log(JSON.stringify(report,null,2));process.exit(0);
}
const pref=manifest.selected_preference||'approximate';
if(pref==='approximate' && !flag('--force')){
  const report={schema:'world-server.gs360-trainer/v3',pass:true,status:'SKIPPED_APPROXIMATE',backend:null,output};save(reportPath,report);console.log(JSON.stringify(report,null,2));process.exit(0);
}

// Refresh registry inside output.
const registryRun=run(process.execPath,[path.join(here,'backend-registry.cjs'),output]);
const registry=load(path.join(output,'GS360_BACKEND_REGISTRY.json'),{});
const backend=arg('--backend',registry.selected||'');
const trainedDir=path.join(output,'trained');
fs.mkdirSync(trainedDir,{recursive:true});
let result=null;
let trainedEntry=null;
let stagedProject=null;

if(backend==='generic_env' && process.env.GS360_TRAIN_CMD){
  const command=formatTemplate(process.env.GS360_TRAIN_CMD,{input:path.join(output,'dataset'),output:trainedDir,manifest:manifestPath});
  result=run(command,[],{shell:true,cwd:output});
  trainedEntry=trainedDir;
}else if(backend==='opensplat'){
  const b=(registry.backends||[]).find(x=>x.id==='opensplat');
  const exe=b?.executable;
  const pose=manifest.pose_estimation||{};
  if(!exe){result={pass:false,status:127,error:'opensplat_not_found'};}
  else if(!pose.pass || !pose.sparse_dir || !fs.existsSync(pose.sparse_dir)){
    result={pass:false,status:4,error:'opensplat_requires_successful_colmap_pose_estimation'};
  }else{
    stagedProject=path.join(output,'trainer_input_colmap');
    fs.rmSync(stagedProject,{recursive:true,force:true});
    fs.mkdirSync(path.join(stagedProject,'images'),{recursive:true});
    fs.mkdirSync(path.join(stagedProject,'sparse'),{recursive:true});
    const views=path.join(output,'dataset','views');
    for(const f of fs.readdirSync(views)){const s=path.join(views,f);if(fs.statSync(s).isFile())copyOrLink(s,path.join(stagedProject,'images',f));}
    copyTree(pose.sparse_dir,path.join(stagedProject,'sparse'));
    const hasGpu=!!registry.gpu?.available;
    const iterations=Number(arg('--iterations',process.env.GS360_TRAIN_ITERATIONS||((pref==='accurate')?(hasGpu?12000:3000):(hasGpu?6000:1500))))||3000;
    trainedEntry=path.join(trainedDir,'splat.ply');
    const canResume=flag('--resume')&&fs.existsSync(trainedEntry);
    const resumeCheckpoint=canResume?path.join(trainedDir,'splat.checkpoint.ply'):null;
    const resumeOutput=canResume?path.join(trainedDir,'splat.resumed.ply'):trainedEntry;
    if(canResume) copyOrLink(trainedEntry,resumeCheckpoint);
    const trainArgs=[stagedProject];
    if(canResume) trainArgs.push('--resume',trainedEntry);
    trainArgs.push('-n',String(iterations),'-o',resumeOutput);
    if(!hasGpu)trainArgs.push('--cpu');
    result=run(exe,trainArgs,{cwd:trainedDir});
    if(result.pass && fs.existsSync(resumeOutput)){
      if(canResume){fs.rmSync(trainedEntry,{force:true});fs.renameSync(resumeOutput,trainedEntry);}
      result={...result,resumed:canResume,checkpoint:resumeCheckpoint};
    } else if(result.pass) result={...result,pass:false,error:'opensplat_finished_without_expected_output'};
  }
}else if(backend==='graphdeco'){
  const b=(registry.backends||[]).find(x=>x.id==='graphdeco');
  const pose=manifest.pose_estimation||{};
  if(!b?.runnable || !b.python || !b.trainScript){result={pass:false,status:127,error:'graphdeco_not_runnable'};}
  else if(!pose.pass || !pose.sparse_dir || !fs.existsSync(pose.sparse_dir)){result={pass:false,status:4,error:'graphdeco_requires_successful_colmap_pose_estimation'};}
  else{
    stagedProject=path.join(output,'trainer_input_colmap');
    fs.rmSync(stagedProject,{recursive:true,force:true});
    fs.mkdirSync(path.join(stagedProject,'images'),{recursive:true});
    const views=path.join(output,'dataset','views');
    for(const f of fs.readdirSync(views)){const s=path.join(views,f);if(fs.statSync(s).isFile())copyOrLink(s,path.join(stagedProject,'images',f));}
    copyTree(pose.sparse_dir,path.join(stagedProject,'sparse'));
    const iterations=Number(arg('--iterations',process.env.GS360_TRAIN_ITERATIONS||'12000'))||12000;
    result=run(b.python,[b.trainScript,'-s',stagedProject,'-m',trainedDir,'--iterations',String(iterations),'--quiet'],{cwd:b.root||output});
    trainedEntry=trainedDir;
  }
}else{
  result={pass:false,status:5,error:'no_runnable_trainer_backend',registrySelected:registry.selected||null};
}

const report={
  schema:'world-server.gs360-trainer/v3',
  pass:!!result?.pass,
  status:result?.pass?'TRAINED':'NOT_TRAINED',
  backend:backend||null,
  preference:pref,
  stagedProject,
  trainedEntry,
  result,
  registryPath:path.join(output,'GS360_BACKEND_REGISTRY.json'),
  finishedAt:new Date().toISOString()
};
save(reportPath,report);

manifest.backend={...(manifest.backend||{}),configured:!!backend,ran:true,kind:backend||null,pass:!!result?.pass,trainerReport:reportPath};
manifest.quality_contract=manifest.quality_contract||{};
manifest.quality_contract.trained_3dgs=!!result?.pass;
manifest.quality_contract.status_label=result?.pass?'True trained 3DGS':(manifest.quality_contract.status_label||'Accurate-ready preview');
if(result?.pass) manifest.artifacts={...(manifest.artifacts||{}),trained:trainedEntry};
save(manifestPath,manifest);

const gamePath=path.join(output,'game','scene.gs360.json');
const game=load(gamePath,{});
if(result?.pass){game.entry=path.relative(path.dirname(gamePath),trainedEntry).replace(/\\/g,'/');game.trained_3dgs=true;save(gamePath,game);}
console.log(JSON.stringify(report,null,2));
process.exit(result?.pass?0:6);
