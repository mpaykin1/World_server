#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const {evaluateQualityRegression}=require('./quality-regression-lib');

const ROOT=process.cwd();
function load(rel){return JSON.parse(fs.readFileSync(path.join(ROOT,rel),'utf8'))}
const SKIP_DIRS=new Set(['node_modules','.git','.hg','.svn','.next','.vercel','.turbo','.cache','dist','build','coverage','.world-server-state','.session-recovery-backups','.system-integration-backups','.blocker-repair-backups','.characterforge-backups','.golden-backup','.patch-backups','.texture-pipeline-backup','.cinematic-voxel-guard-backup-20260828-190316','.pytest_cache','.claude']);
function walk(dir,base=''){
  const out=[]; if(!fs.existsSync(dir))return out;
  let entries;
  try{ entries=fs.readdirSync(dir,{withFileTypes:true}); }catch{ return out; }
  for(const ent of entries){
    // Never follow symlinks — prevents junction/symlink cycles (node_modules/.bin on Windows) causing stack overflow
    if(ent.isSymbolicLink()) continue;
    const rel=path.posix.join(base,ent.name),abs=path.join(dir,ent.name);
    if(ent.isDirectory()){
      if(SKIP_DIRS.has(ent.name)) continue;
      out.push(...walk(abs,rel));
    } else out.push(rel);
  } return out;
}
const existingFiles=walk(ROOT);
const result=evaluateQualityRegression({
  baseline:load('data/quality-baseline.json'),
  scorecard:load('data/quality-scorecard.json'),
  errors:load('data/error-prevention-registry.json'),
  golden:load('data/golden-components.json'),
  releaseRegistry:load('data/app-release-registry.json'),
  migrations:load('data/quality-migrations.json'),
  existingFiles
});
fs.writeFileSync(path.join(ROOT,'QUALITY_REGRESSION_REPORT.json'),JSON.stringify({...result,generatedAt:new Date().toISOString()},null,2)+'\n');

console.log(`[NO_REGRESSION] baseline=${result.baselineOverall.toFixed(2)} current=${result.currentOverall.toFixed(2)} violations=${result.violations.length}`);
for(const v of result.violations) console.error(' -',v.type,JSON.stringify(v));
for(const i of result.improvements) console.log(' +',i.type,JSON.stringify(i));
if(!result.pass) process.exit(3);
console.log('[NO_REGRESSION] PASS');
