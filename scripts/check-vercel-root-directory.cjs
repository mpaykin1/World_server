#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
const VERCEL_PROJECT_JSON=path.join(ROOT,'.vercel','project.json');
const VERCEL_JSON=path.join(ROOT,'vercel.json');

function readJson(p){ try{return JSON.parse(fs.readFileSync(p,'utf8'))}catch{return null} }

function run(cmd,args){
  try{ const out=cp.execFileSync(cmd,args,{cwd:ROOT,encoding:'utf8',timeout:15000, shell: false}); return String(out||'') }catch(e){ return String(e.stdout||e.stderr||e.message||'') }
}
function runNpx(args){
  const npx = process.platform==='win32' ? 'npx.cmd' : 'npx';
  return run(npx, args);
}

const project=readJson(VERCEL_PROJECT_JSON);
const vercelJson=readJson(VERCEL_JSON);

let errors=[], warnings=[];
let rootDir='.'; // default

let inspectedRoot=null;
try{
  const txt=runNpx([ 'vercel','project','inspect','world-server' ]);
  const m=txt.match(/Root Directory\s+([^\n\r]+)/i);
  if(m) inspectedRoot=m[1].trim();
  // npx may output via stderr, try alternative parsing
  if(!inspectedRoot && txt.includes('Root Directory')){
    const m2=txt.split('Root Directory')[1]?.split('\n')[0];
    if(m2) inspectedRoot=m2.replace(/[^a-zA-Z0-9.\/_-]/g,'').trim() || '.';
  }
}catch{}

if(inspectedRoot) rootDir=inspectedRoot;
else if(project){
  // project.json does not contain rootDirectory, but we can infer expected
  if(project.projectName==='world-server') rootDir='.';
  else if(project.projectName==='improve-world-home' || project.projectName==='improve-world-home-git') rootDir='apps/improve-world-home';
}

const worldServerExpectedRoot='.';
const improveExpectedRoot='apps/improve-world-home';

if(project && project.projectId==='prj_XsKyvMHpuNomoPBxuOD8vd26Fi3y'){
  if(project.projectName!=='world-server'){
    errors.push(`projectId prj_XsKyv mismatch: expected world-server but got ${project.projectName}`);
  }
  // world-server must have Root Directory "." — apps/improve-world-home does not exist on this branch
  const improveExists=fs.existsSync(path.join(ROOT,improveExpectedRoot));
  const worldRootExists=fs.existsSync(path.join(ROOT,worldServerExpectedRoot,'vercel.json')) && fs.existsSync(path.join(ROOT,'package.json'));
  if(!worldRootExists){
    errors.push(`world-server Root Directory "${worldServerExpectedRoot}" missing vercel.json/package.json`);
  }
  if(inspectedRoot && inspectedRoot==='apps/improve-world-home'){
    errors.push(`Vercel project world-server Root Directory is "${inspectedRoot}" but ${improveExpectedRoot} does not exist in branch ${run('git',['branch','--show-current']).trim()} — deployment will fail with "Root Directory does not exist". Expected "${worldServerExpectedRoot}" for world-server.`);
  }
  if(improveExists && rootDir===improveExpectedRoot){
    warnings.push(`apps/improve-world-home exists — ensure it is not accidentally used as world-server Root Directory`);
  }
  if(!improveExists && inspectedRoot===improveExpectedRoot){
    errors.push(`apps/improve-world-home deleted on this branch (767a49af -> HEAD) but Vercel still expects it — update Vercel dashboard Root Directory to "${worldServerExpectedRoot}"`);
  }
}

// Check vercel.json at root defines production entrypoint
if(!vercelJson){
  errors.push('vercel.json missing at root');
} else {
  if(!vercelJson.redirects || !vercelJson.redirects.some(r=>r.destination && r.destination.includes('/apps/catalog'))){
    warnings.push('vercel.json redirects do not point to /apps/catalog — verify production entrypoint');
  }
  if(vercelJson.regions && !vercelJson.regions.includes('sin1')){
    warnings.push('vercel.json regions changed');
  }
}

// Check apps/catalog exists as real entrypoint for world-server
const catalogExists=fs.existsSync(path.join(ROOT,'apps','catalog'));
if(!catalogExists){
  errors.push('Production entrypoint apps/catalog not found — world-server redirect target missing');
}

const pass=errors.length===0;
const report={schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),projectId:project?.projectId||null,projectName:project?.projectName||null,inspectedRootDirectory:inspectedRoot||null,expectedRootForWorldServer:worldServerExpectedRoot,pass,errors,warnings};
fs.writeFileSync(path.join(ROOT,'VERCEL_ROOT_DIRECTORY_STATUS.json'),JSON.stringify(report,null,2)+'\n');
if(errors.length) console.error('[VERCEL_ROOT] FAIL',errors.join(' | '));
if(warnings.length) console.warn('[VERCEL_ROOT] WARN',warnings.join(' | '));
if(pass) console.log(`[VERCEL_ROOT] PASS project=${project?.projectName||'?'} root=${inspectedRoot||worldServerExpectedRoot} catalog=${catalogExists}`);
else process.exitCode=2;
module.exports={pass,errors,warnings};
