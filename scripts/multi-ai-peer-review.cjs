#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd();
function run(cmd,args,opts={}){ return require('child_process').spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',maxBuffer:64*1024*1024,...opts}); }
function getBranches(){ const r=run('git',['branch','-a','--format=%(refname)'],{windowsHide:true}); return (r.stdout||'').split('\n').filter(Boolean); }
function getWorktrees(){ const r=run('git',['worktree','list','--porcelain'],{windowsHide:true}); return r.stdout||''; }
function getChanged(branch){ const r=run('git',['diff','--name-only',`origin/master...${branch}`],{windowsHide:true}); return (r.stdout||'').split('\n').filter(Boolean); }

function main(){
  const branches=getBranches().filter(b=>b.includes('ai/')||b.includes('opencode/')).slice(0,10);
  const worktrees=getWorktrees();
  const prCheck=fs.existsSync(path.join(ROOT,'.github/workflows/ci.yml'));
  const wipExists=fs.existsSync(path.join(ROOT,'WORK_IN_PROGRESS.md'));
  const report={
    at:new Date().toISOString(),
    branches:branches.length,
    worktrees:worktrees.split('\n').filter(l=>l.startsWith('worktree')).length,
    prCheck, wipExists,
    duplicates:[],
    reusable:[],
    conflicts:[]
  };
  // Detect duplicate systems: compare changed files across AI branches
  const branchFiles={};
  for(const b of branches){
    const short=b.replace('refs/remotes/origin/','').replace('refs/heads/','');
    branchFiles[short]=getChanged(short);
  }
  const allFiles={};
  for(const [br,files] of Object.entries(branchFiles)){
    for(const f of files){
      if(!allFiles[f]) allFiles[f]=[];
      allFiles[f].push(br);
    }
  }
  for(const [f,brs] of Object.entries(allFiles)){
    if(brs.length>1) report.duplicates.push({file:f, branches:brs});
    if(f.includes('Golden')||f.includes('quality')||f.includes('regression')) report.reusable.push(f);
  }
  // Simple conflict detection: same file modified in multiple branches with different content hash would be detected via git merge-base, simplified here
  if(report.duplicates.length>3) report.conflicts.push('multiple AI branches touch same systems - review blast radius before porting');
  // Commit messages are claims, not test execution evidence.
  report.bestCoverageBranch=null;
  report.qualityGate='unknown';
  report.qualityEvidence='No verified test artifact supplied; branch overlap only.';
  console.log(JSON.stringify(report,null,2));
  // Also write to control-plane friendly location
  fs.mkdirSync(path.join(ROOT,'state'),{recursive:true});
  fs.writeFileSync(path.join(ROOT,'state/multi-ai-peer-review.json'),JSON.stringify(report,null,2));
  // Exit code 0 always, but log duplicates as warning
  if(report.duplicates.length) console.warn(`[PEER_REVIEW] duplicates detected: ${report.duplicates.length} files touched by multiple AIs`);
  if(report.conflicts.length) console.warn(`[PEER_REVIEW] conflicts: ${report.conflicts.join('; ')}`);
}
if(require.main===module) main();
module.exports={main};
