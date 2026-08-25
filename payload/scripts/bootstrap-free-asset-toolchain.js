#!/usr/bin/env node
'use strict';
const fs=require('fs');const path=require('path');const cp=require('child_process');
const ROOT=process.cwd();const lock=JSON.parse(fs.readFileSync(path.join(ROOT,'data/asset-toolchain-lock.json'),'utf8'));const pkg=JSON.parse(fs.readFileSync(path.join(ROOT,'package.json'),'utf8'));
const wanted=Object.entries(lock.packages||{});const missing=wanted.filter(([name,version])=>String(pkg.devDependencies?.[name]||pkg.dependencies?.[name]||'')!==version);
const report={schemaVersion:'1.0.0',wanted:Object.fromEntries(wanted),missing:missing.map(([n])=>n),installed:false,verified:false};
function run(cmd,args){const r=cp.spawnSync(cmd,args,{cwd:ROOT,stdio:'inherit',shell:false});if(r.status!==0)throw new Error(`${cmd} exit ${r.status}`);}
try{
  if(missing.length){const npm=process.platform==='win32'?'npm.cmd':'npm';run(npm,['install','--save-dev','--save-exact',...missing.map(([n,v])=>`${n}@${v}`)]);report.installed=true;}
  const npm=process.platform==='win32'?'npm.cmd':'npm';for(const [n,v] of wanted)run(npm,['ls',`${n}@${v}`,'--depth=0']);report.verified=true;
}catch(e){report.error=String(e?.message||e);process.exitCode=88;}
fs.writeFileSync(path.join(ROOT,'ASSET_TOOLCHAIN_BOOTSTRAP_REPORT.json'),JSON.stringify(report,null,2)+'\n');console.log(`[ASSET_TOOLCHAIN] installed=${report.installed} verified=${report.verified} missing=${report.missing.length}`);
