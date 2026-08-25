#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const ROOT=process.cwd();
const id=process.env.QUALITY_CONFIRMED_ERROR_ID||process.argv[2];
const beforeArg=process.env.QUALITY_FIX_BEFORE||process.argv[3];
const afterArg=process.env.QUALITY_FIX_AFTER||process.argv[4];
if(!id)throw new Error('QUALITY_CONFIRMED_ERROR_ID or argv[2] required');

const errPath=path.join(ROOT,'data/error-prevention-registry.json');
const learnPath=path.join(ROOT,'data/autofix-learning.json');
const errors=JSON.parse(fs.readFileSync(errPath,'utf8')),learning=JSON.parse(fs.readFileSync(learnPath,'utf8'));
errors.knownErrors=errors.knownErrors||[];
let e=errors.knownErrors.find(x=>x.id===id);
if(!e){e={id,status:'protected',severity:'release-blocker',confirmedFixedAt:new Date().toISOString()};errors.knownErrors.push(e)}
e.status='protected';e.confirmedFixedAt=new Date().toISOString();
fs.writeFileSync(errPath,JSON.stringify(errors,null,2)+'\n');

let candidate=null;
if(beforeArg&&afterArg){
 const bp=path.resolve(beforeArg),ap=path.resolve(afterArg);
 if(fs.existsSync(bp)&&fs.existsSync(ap)){
  const before=fs.readFileSync(bp,'utf8'),after=fs.readFileSync(ap,'utf8');
  // Conservative single contiguous replacement extraction.
  let a=0;while(a<before.length&&a<after.length&&before[a]===after[a])a++;
  let b0=before.length-1,b1=after.length-1;
  while(b0>=a&&b1>=a&&before[b0]===after[b1]){b0--;b1--}
  const from=before.slice(a,b0+1),to=after.slice(a,b1+1);
  const deterministic=from.length>0&&from.length<=1200&&to.length<=1200&&!/token|password|secret|key/i.test(from+to);
  if(deterministic){
   const rid='learned-'+crypto.createHash('sha1').update(id+from+to).digest('hex').slice(0,12);
   candidate={id:rid,errorId:id,status:'candidate',from,to,createdAt:new Date().toISOString(),requiresIndependentOccurrence:true};
   learning.candidates=learning.candidates.filter(x=>x.id!==rid);learning.candidates.push(candidate);
  }
 }
}
fs.writeFileSync(learnPath,JSON.stringify(learning,null,2)+'\n');
console.log(`[LEARN_FIX] protected=${id} recipeCandidate=${candidate?.id||'none'}`);
