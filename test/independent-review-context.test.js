'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {readCandidateContext}=require('../scripts/independent-review-context.cjs');
const {reviewPatch,splitCloudflarePatch}=require('../scripts/independent-review-gate.cjs');
const head='b'.repeat(40),base='a'.repeat(40);
const scripts={build:'npm run viewport:inject','release:gate':'npm run viewport:check','viewport:inject':'node scripts/inject-game-viewport-lock.js','viewport:check':'node scripts/game-viewport-lock-gate.js'};
function git(_command,args){
  assert.equal(_command,'git');
  assert.equal(args[0],'show');
  assert.ok(args[1].startsWith(head+':'));
  const file=args[1].slice(41);
  return JSON.stringify(file==='package.json'?{scripts:{...scripts,unrelated:'ignored'},credentials:'not exported'}:
    file==='vercel.json'?{buildCommand:'node scripts/inject-game-viewport-lock.js',env:{secret:'not exported'}}:{build:{command:'node scripts/inject-game-viewport-lock.js',env:{secret:'not exported'}}});
}
test('context reads exact SHA blobs and only bounded command excerpts',()=>{
  const c=readCandidateContext(head,git);
  assert.equal(c.head,head);
  assert.deepEqual(c.files[0].excerpt.scripts,scripts);
  assert.equal(c.files.length,3);
  assert.ok(c.files.every(f=>/^[a-f0-9]{64}$/.test(f.blobSha256)));
  assert.ok(!JSON.stringify(c).includes('not exported'));
});
test('invalid SHA, missing/invalid blobs, secret and oversized commands fail closed',()=>{
  assert.throws(()=>readCandidateContext('--bad',()=>assert.fail('must not execute')),/SHA/);
  assert.throws(()=>readCandidateContext(head,()=>{throw new Error('missing blob');}),/candidate JSON/);
  assert.throws(()=>readCandidateContext(head,()=>'{bad'),/JSON/);
  assert.throws(()=>readCandidateContext(head,()=>JSON.stringify({scripts:{build:'ghp_'+'x'.repeat(32)}})),/credential/);
  assert.throws(()=>readCandidateContext(head,()=>JSON.stringify({scripts:{build:'x'.repeat(6100)}})),/budget/);
});
test('context mismatch never invokes any provider',async()=>{
  const report=await reviewPatch({patch:'diff --git a/a b/a\n+x\n',base,head,key:'dummy',candidateContext:{head:base},getCatalog:async()=>assert.fail('no provider')});
  assert.equal(report.verdict,'INCONCLUSIVE');
  assert.match(report.blockers.join(' '),/context SHA/);
});
test('context accompanies each chunk and complete independent review remains required',async()=>{
  const candidateContext=readCandidateContext(head,git);
  const patch=Array.from({length:3},(_,i)=>'diff --git a/f'+i+' b/f'+i+'\n+'+'x'.repeat(7500)+'\n').join('');
  const seen=[];
  const report=await reviewPatch({patch,base,head,key:'',candidateContext,
    cloudflare:{accountId:'a'.repeat(32),token:'cfut_'+'a'.repeat(24),freePlanConfirmed:true},
    reviewCloudflare:async(model,part,metadata)=>{
      assert.deepEqual(metadata.untrustedCandidateContext,candidateContext);
      assert.ok(Buffer.byteLength(part)+Buffer.byteLength(JSON.stringify(candidateContext))<=18000);
      seen.push(metadata.chunkIndex);
      return {family:model.family,model:model.id,verdict:'PASS',findings:[],falsification_attempts:['checked this chunk']};
    }});
  assert.equal(report.verdict,'PASS');
  assert.equal(report.requiresMaintainerDecision,true);
  assert.ok(report.reviewers.every(r=>r.reviewedChunks===r.totalChunks));
  assert.equal(seen.length,report.reviewChunks.length*2);
  assert.match(report.candidateContextSha256,/^[a-f0-9]{64}$/);
  assert.equal(splitCloudflarePatch(patch,18001),null);
});
