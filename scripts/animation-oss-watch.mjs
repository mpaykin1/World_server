#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const ROOT=process.cwd();
const registryPath=path.join(ROOT,'data/game-motion-oss-registry.json');
const lockPath=path.join(ROOT,'data/game-motion-oss-lock.json');
const registry=JSON.parse(fs.readFileSync(registryPath,'utf8'));
const lock=fs.existsSync(lockPath)?JSON.parse(fs.readFileSync(lockPath,'utf8')):{repos:{}};
const token=process.env.GITHUB_TOKEN||'';
const headers={'User-Agent':'WorldServer-GameMotion-OSS-Watch','Accept':'application/vnd.github+json',...(token?{Authorization:`Bearer ${token}`}:{})};
const out=[];
for(const item of registry.repositories){
  try{
    const repoRes=await fetch(`https://api.github.com/repos/${item.repo}`,{headers});
    if(!repoRes.ok)throw new Error(`repo HTTP ${repoRes.status}`);
    const repo=await repoRes.json();
    const branch=item.branch||repo.default_branch||'main';
    const commitRes=await fetch(`https://api.github.com/repos/${item.repo}/commits/${encodeURIComponent(branch)}`,{headers});
    if(!commitRes.ok)throw new Error(`commit HTTP ${commitRes.status}`);
    const commit=await commitRes.json();
    const licenseKey=String(repo.license?.key||'unknown').toLowerCase();
    const allowed=registry.licensePolicy.autoAllowed.includes(licenseKey);
    const previous=lock.repos?.[item.id]?.sha||null;
    out.push({id:item.id,repo:item.repo,branch,sha:commit.sha,previous,updateAvailable:!!previous&&previous!==commit.sha,firstSeen:!previous,license:licenseKey,licenseAllowedForAuto:allowed,pushedAt:repo.pushed_at||null,htmlUrl:repo.html_url});
  }catch(e){out.push({id:item.id,repo:item.repo,error:String(e.message||e)})}
}
const report={schemaVersion:'1.0.0',generatedAt:new Date().toISOString(),updates:out.filter(x=>x.updateAvailable).length,results:out};
fs.writeFileSync(path.join(ROOT,'ANIMATION_OSS_UPDATE_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[ANIMATION_OSS_WATCH] checked=${out.length} updates=${report.updates}`);
if(process.argv.includes('--refresh-lock')){
  const next={schemaVersion:'1.0.0',updatedAt:new Date().toISOString(),repos:{...(lock.repos||{})}};
  for(const r of out)if(r.sha&&r.licenseAllowedForAuto)next.repos[r.id]={repo:r.repo,sha:r.sha,license:r.license,updatedAt:new Date().toISOString()};
  fs.writeFileSync(lockPath,JSON.stringify(next,null,2)+'\n');
  console.log('[ANIMATION_OSS_WATCH] lock refreshed for auto-allowed licenses.');
}
if(process.argv.includes('--fail-on-update')&&report.updates)process.exitCode=2;
