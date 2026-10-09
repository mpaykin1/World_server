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
function manifestGit(manifest='apps/gothic-destruction-mvp/renderer.mjs\0',source='export const maxDpr=0.5;',reads=[]){
  return (command,args,options)=>{
    assert.equal(command,'git');
    reads.push({args,options});
    if(args[0]==='diff'){
      assert.deepEqual(args,['diff','--name-only','--diff-filter=A','--no-renames','-z',base+'...'+head,'--']);
      assert.equal(options.maxBuffer,8192);
      return manifest;
    }
    if(args[1]===''+head+':apps/gothic-destruction-mvp/renderer.mjs')return source;
    return git(command,args);
  };
}
test('exact-base added-file manifest and full new app module are inert, hashed Git data',()=>{
  const crypto=require('node:crypto'),reads=[];
  const source='globalThis.__addedModuleProbe=true; export const maxDpr=0.5;';
  const manifest='docs/new file.md\0apps/gothic-destruction-mvp/renderer.mjs\0apps/voxel-world/blocks.mjs\0';
  const c=readCandidateContext(head,manifestGit(manifest,source,reads),null,base);
  assert.equal(globalThis.__addedModuleProbe,undefined);
  assert.deepEqual(c.addedFiles.files,['docs/new file.md','apps/gothic-destruction-mvp/renderer.mjs','apps/voxel-world/blocks.mjs']);
  assert.equal(c.addedFiles.base,base);
  assert.equal(c.addedFiles.head,head);
  assert.equal(c.addedFiles.comparison,'merge-base-to-head');
  assert.equal(c.addedFiles.manifestSha256,crypto.createHash('sha256').update(manifest).digest('hex'));
  assert.equal(c.completeAddedModule.file,'apps/gothic-destruction-mvp/renderer.mjs');
  assert.equal(c.completeAddedModule.source,source);
  assert.equal(c.completeAddedModule.blobSha256,crypto.createHash('sha256').update(source).digest('hex'));
  assert.equal(c.completeAddedModule.sourceBytes,Buffer.byteLength(source));
  assert.equal(c.completeAddedModule.sourceIncluded,true);
  assert.equal(c.completeAddedModule.executed,false);
  assert.ok(!reads.some(r=>r.args[1]?.endsWith(':apps/voxel-world/blocks.mjs')));
});
test('an invalid exact review base fails before any Git read',()=>{
  assert.throws(()=>readCandidateContext(head,()=>assert.fail('no Git'),null,'--bad'),/review base SHA/);
});
test('added-file evidence is opt-in for synthetic context and empty additions are explicit',()=>{
  assert.equal(readCandidateContext(head,git).addedFiles,undefined);
  const c=readCandidateContext(head,manifestGit(''),null,base);
  assert.deepEqual(c.addedFiles.files,[]);
  assert.equal(c.completeAddedModule,undefined);
});
test('malformed, unsafe, duplicate, too many or oversized manifest names fail closed',()=>{
  const samples=['missing-terminator','../outside.mjs\0','apps//renderer.mjs\0',
    '/absolute.mjs\0','apps\\renderer.mjs\0','apps/tab\tname.mjs\0','bad\nname\0','bad\ufffdname\0',
    'same\0same\0','x'.repeat(201)+'\0',Array.from({length:65},(_,i)=>'file'+i+'\0').join(''),'x'.repeat(8193)+'\0'];
  for(const manifest of samples)assert.throws(()=>readCandidateContext(head,manifestGit(manifest),null,base),/added-file manifest/);
});
test('manifest credentials and unavailable Git results produce redacted failures',()=>{
  const token='ghp_'+'x'.repeat(32);
  assert.throws(()=>readCandidateContext(head,manifestGit(token+'\0'),null,base),
    err=>/credential/.test(err.message)&&!err.message.includes(token));
  assert.throws(()=>readCandidateContext(head,(command,args)=>{
    if(args[0]==='diff')throw new Error('private details '+token);
    return git(command,args);
  },null,base),err=>/added-file manifest/.test(err.message)&&!err.message.includes(token));
});
test('module source has a UTF-8 bound; metadata is explicit for larger sources',()=>{
  const source='é'.repeat(769);
  const c=readCandidateContext(head,manifestGit(undefined,source),null,base);
  assert.equal(c.completeAddedModule.sourceBytes,1538);
  assert.equal(c.completeAddedModule.sourceIncluded,false);
  assert.equal(c.completeAddedModule.source,undefined);
  assert.match(c.completeAddedModule.scope,/metadata only/);
  assert.equal(c.completeAddedModule.executed,false);
});
test('missing, oversized and credential-bearing added modules fail closed without source disclosure',()=>{
  const token='ghp_'+'x'.repeat(32);
  for(const source of [null,'x'.repeat(65537),token]){
    assert.throws(()=>readCandidateContext(head,(command,args,options)=>{
      if(args[1]===head+':apps/gothic-destruction-mvp/renderer.mjs'){
        if(source===null)throw new Error('private module '+token);
        return source;
      }
      return manifestGit()(command,args,options);
    },null,base),err=>/added-module blob/.test(err.message)&&!err.message.includes(token));
  }
});
test('non-app files are listed without reading them as added module context',()=>{
  const c=readCandidateContext(head,manifestGit('private/new.mjs\0apps/new/script.js\0'),null,base);
  assert.equal(c.addedFiles.files.length,2);
  assert.equal(c.completeAddedModule,undefined);
});
test('combined command, syntax and addition evidence keeps the unchanged total budget',()=>{
  const manifest=Array.from({length:50},(_,i)=>'docs/'+i+'x'.repeat(100)+'.md\0').join('');
  assert.throws(()=>readCandidateContext(head,manifestGit(manifest),null,base),/context exceeds budget/);
});
test('added-file base or head mismatch prevents all provider calls',async()=>{
  for(const addedFiles of [{base:head,head},{base,head:base}]){
    const candidateContext={head,addedFiles};
    const report=await reviewPatch({patch:'diff --git a/a b/a\n+x\n',base,head,key:'dummy',candidateContext,
      getCatalog:async()=>assert.fail('no provider'),reviewCloudflare:async()=>assert.fail('no provider')});
    assert.equal(report.verdict,'INCONCLUSIVE');
    assert.match(report.blockers.join(' '),/context SHA/);
  }
});
test('manifest and complete module accompany every chunk without changing the full diff',async()=>{
  const candidateContext=readCandidateContext(head,manifestGit(),null,base),seen=[];
  const patch=Array.from({length:4},(_,i)=>'diff --git a/f'+i+' b/f'+i+'\n+'+'x'.repeat(7400)+'\n').join('');
  const report=await reviewPatch({patch,base,head,key:'',candidateContext,
    cloudflare:{accountId:'a'.repeat(32),token:'cfut_'+'a'.repeat(24),freePlanConfirmed:true},
    reviewCloudflare:async(model,part,metadata)=>{
      assert.deepEqual(metadata.untrustedCandidateContext,candidateContext);
      assert.ok(Buffer.byteLength(part)+Buffer.byteLength(JSON.stringify(candidateContext))<=18000);
      seen.push({family:model.family,part});
      return {family:model.family,model:model.id,verdict:'PASS',findings:[],falsification_attempts:['reviewed full supplied chunk']};
    }});
  assert.equal(report.verdict,'PASS');
  assert.equal(report.requiresMaintainerDecision,true);
  for(const family of new Set(seen.map(x=>x.family)))assert.equal(seen.filter(x=>x.family===family).map(x=>x.part).join(''),patch);
  assert.ok(report.reviewers.every(r=>r.reviewedChunks===r.totalChunks));
});

test('complete module provenance must match the exact head and addition manifest',async()=>{
  for(const completeAddedModule of [{head:base,file:'apps/new.mjs'},{head,file:'apps/not-added.mjs'}]){
    const candidateContext={head,addedFiles:{base,head,files:['apps/new.mjs']},completeAddedModule};
    const report=await reviewPatch({patch:'diff --git a/a b/a\n+x\n',base,head,key:'dummy',candidateContext,
      getCatalog:async()=>assert.fail('no provider'),reviewCloudflare:async()=>assert.fail('no provider')});
    assert.equal(report.verdict,'INCONCLUSIVE');
    assert.match(report.blockers.join(' '),/context SHA/);
  }
});
