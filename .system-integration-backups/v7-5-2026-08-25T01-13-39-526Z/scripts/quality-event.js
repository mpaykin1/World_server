#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(), pErr=path.join(ROOT,'data/error-prevention-registry.json'), pGold=path.join(ROOT,'data/golden-components.json');
const load=p=>JSON.parse(fs.readFileSync(p,'utf8')), save=(p,v)=>fs.writeFileSync(p,JSON.stringify(v,null,2)+'\n'), now=()=>new Date().toISOString();
const [cmd,...args]=process.argv.slice(2);
if(cmd==='confirm-fix'){
  const [id,testId=null]=args;if(!id)throw new Error('confirm-fix requires error id');
  const r=load(pErr),e=(r.knownErrors||[]).find(x=>x.id===id);if(!e)throw new Error(`unknown error: ${id}`);
  e.status='protected';e.protectedAt=now();if(testId)e.regressionTest=testId;
  (r.events||(r.events=[])).push({type:'FIX_CONFIRMED',id,at:now(),regressionTest:testId});save(pErr,r);
  console.log(`[QUALITY_EVENT] FIX_CONFIRMED ${id}`);
}else if(cmd==='promote'){
  const [id,source,scope='all-compatible']=args;if(!id||!source)throw new Error('promote requires component id + exact source/asset ref');
  const r=load(pGold);r.components=r.components||{};const c=r.components[id]||{};
  c.canonical=source;c.status='golden';c.promotedAt=now();c.scope=c.scope||scope;c.verification='user-approved + regression verification required';
  r.components[id]=c;save(pGold,r);console.log(`[QUALITY_EVENT] GOLDEN_PROMOTED ${id} -> ${source}`);
}else throw new Error('usage: quality-event <confirm-fix|promote> ...');
if(cmd==='promote'){
  try{cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/propagate-golden-components.js')],{stdio:'inherit'});}
  catch(e){console.error('[QUALITY_EVENT] Golden propagation created release blockers; compatible apps remain quarantined until adoption.');}
}
cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/quality-governance.js')],{stdio:'inherit'});
