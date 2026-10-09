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
  if(file==='scripts/independent-review-gate.cjs')return 'async function reviewPatch({candidateContext=null}) {}';
  if(file==='.github/workflows/independent-pr-review.yml')return 'node scripts/independent-review-gate.cjs \\\n --base "$BASE_SHA" --head "$HEAD_SHA" \\\n --output "$RUNNER_TEMP/INDEPENDENT_REVIEW_REPORT.json"';
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

test('complete gate syntax evidence parses without executing candidate code',()=>{
  assert.equal(globalThis.__candidateReviewProbe,undefined);
  const c=readCandidateContext(head,(command,args)=>args[1].endsWith(':scripts/independent-review-gate.cjs')?
    'globalThis.__candidateReviewProbe=true; throw new Error("must not run");':git(command,args));
  assert.equal(globalThis.__candidateReviewProbe,undefined);
  assert.equal(c.syntaxEvidence.syntax,'PASS');
  assert.equal(c.syntaxEvidence.executed,false);
  assert.equal(c.syntaxEvidence.parser,'node:vm.Script');
  assert.match(c.syntaxEvidence.blobSha256,/^[a-f0-9]{64}$/);
  assert.ok(c.reviewInvocation.baseAndHeadFlags);
  assert.ok(Buffer.byteLength(JSON.stringify(c))<=6000);
});
test('missing, oversized and invalid syntax blobs fail closed with redacted errors',()=>{
  for(const source of [null,'x'.repeat(65537),'function broken({ ) { /* hidden */']){
    assert.throws(()=>readCandidateContext(head,(command,args)=>{
      if(args[1].endsWith(':scripts/independent-review-gate.cjs')){
        if(source===null)throw new Error('private source unavailable');
        return source;
      }
      return git(command,args);
    }),error=>/static (review blob|syntax)/.test(error.message)&&!error.message.includes('hidden')&&!error.message.includes('private'));
  }
});
test('actual workflow excerpt rejects credentials and oversized or absent commands',()=>{
  const token='ghp_'+'x'.repeat(32);
  for(const source of ['node scripts/independent-review-gate.cjs --head '+token,
    'node scripts/independent-review-gate.cjs '+'x'.repeat(513),'echo not a review command']){
    assert.throws(()=>readCandidateContext(head,(command,args)=>args[1].endsWith(':.github/workflows/independent-pr-review.yml')?source:git(command,args)),
      error=>/credential|budget|invocation/.test(error.message)&&!error.message.includes(token));
  }
});
test('workflow provenance uses exact trusted SHA rather than changed candidate workflow',()=>{
  const trusted='node scripts/independent-review-gate.cjs --base "$BASE_SHA" --head "$HEAD_SHA"';
  const reads=[];
  const c=readCandidateContext(head,(command,args)=>{
    reads.push(args[1]);
    if(args[1]===base+':.github/workflows/independent-pr-review.yml')return trusted;
    return git(command,args);
  },base);
  assert.equal(c.head,head);
  assert.equal(c.reviewInvocation.sha,base);
  assert.equal(c.reviewInvocation.scope,'trusted-master');
  assert.equal(c.reviewInvocation.excerpt,trusted);
  assert.ok(c.reviewInvocation.baseAndHeadFlags);
  assert.ok(reads.includes(base+':.github/workflows/independent-pr-review.yml'));
  assert.ok(!reads.includes(head+':.github/workflows/independent-pr-review.yml'));
  assert.equal(readCandidateContext(head,git).reviewInvocation.scope,'candidate-only');
  assert.throws(()=>readCandidateContext(head,()=>assert.fail('no Git read'),'invalid trusted SHA'),/trusted SHA/);
});
test('combined static evidence remains within the total context budget',()=>{
  const full=readCandidateContext(head,git);
  const partial={...full};delete partial.syntaxEvidence;delete partial.reviewInvocation;
  const padding=6000-Buffer.byteLength(JSON.stringify(partial))-16;
  assert.ok(padding>0);
  assert.throws(()=>readCandidateContext(head,(command,args)=>args[1].endsWith(':package.json')?
    JSON.stringify({scripts:{...scripts,build:scripts.build+'x'.repeat(padding)}}):git(command,args)),/context exceeds budget/);
});
test('a one-line invocation never exports neighboring workflow lines',()=>{
  const token='ghp_'+'z'.repeat(32);
  const c=readCandidateContext(head,(command,args)=>args[1].endsWith(':.github/workflows/independent-pr-review.yml')?
    'node scripts/independent-review-gate.cjs --base "$BASE_SHA" --head "$HEAD_SHA"\nUNRELATED='+token:git(command,args));
  assert.ok(c.reviewInvocation.baseAndHeadFlags);
  assert.ok(!JSON.stringify(c).includes(token));
  assert.ok(!c.reviewInvocation.excerpt.includes('UNRELATED'));
});