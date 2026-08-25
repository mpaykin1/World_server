#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),STATE=path.join(ROOT,'.quality-autopilot-state','state.json'),CFG=path.join(ROOT,'data','quiet-quality-autopilot.json');
const result=(process.argv.find(x=>x.startsWith('--result='))||'').split('=')[1];
const stage=(process.argv.find(x=>x.startsWith('--stage='))||'').split('=')[1]||'external';
if(!['success','failure'].includes(result)){console.error('use --result=success|failure');process.exit(2)}
const cfg=JSON.parse(fs.readFileSync(CFG,'utf8'));
let s={};try{s=JSON.parse(fs.readFileSync(STATE,'utf8'))}catch(_){}
s.lastExternalVerification={at:new Date().toISOString(),stage,result};
if(result==='failure'){
  s.failedImproveStreak=Number(s.failedImproveStreak||0)+1;
  const threshold=Number(cfg.mutationBreaker?.openAfterFailedImproveCycles||2);
  if(s.failedImproveStreak>=threshold){
    const ms=Number(cfg.mutationBreaker?.cooldownHours||24)*3600*1000;
    s.mutationBreakerUntil=new Date(Date.now()+ms).toISOString();
  }
}else if(stage==='production'){
  s.failedImproveStreak=0;
  s.mutationBreakerUntil=null;
}
fs.mkdirSync(path.dirname(STATE),{recursive:true});
fs.writeFileSync(STATE,JSON.stringify(s,null,2)+'\n');
console.log(`[QUALITY_FEEDBACK] stage=${stage} result=${result} failedImproveStreak=${s.failedImproveStreak||0}`);
