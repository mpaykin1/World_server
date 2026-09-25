'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const cp=require('node:child_process');
const {readPatch,PatchReadError,MAX_PATCH_BYTES}=
 require('../scripts/independent-review-patch-reader.cjs');
const a='a'.repeat(40),b='b'.repeat(40);

test('binary GLB-sized changes fail closed before invoking huge git diff',()=>{
 let calls=0;
 const mock=(_exe,args)=>{
  calls++;
  assert.equal(args[1],'--numstat');
  return '-\t-\tassets/models/hero.glb\0-\t-\tassets/models/terrain.glb\0';
 };
 assert.throws(()=>readPatch(a,b,{run:mock}),/2 binary file/);
 assert.equal(calls,1);
});

test('ordinary patch is byte-complete and bounded; oversized patch fails closed',()=>{
 const patch='diff --git a/a.js b/a.js\n@@ -1 +1 @@\n-old\n+new\n';
 const run=(_exe,args)=>args[1]==='--numstat'?'1\t1\ta.js\0':patch;
 assert.equal(readPatch(a,b,{run}),patch);
 const large=()=> 'x'.repeat(MAX_PATCH_BYTES+1);
 assert.throws(()=>readPatch(a,b,{run:(_exe,args)=>
   args[1]==='--numstat'?'1\t1\tlarge.js\0':large()}),/review budget/);
 assert.throws(()=>readPatch(a,b,{run:(_exe,args)=>{
  if(args[1]==='--numstat')return '1\t1\tlarge.js\0';
  const err=new Error('maxBuffer exceeded');err.code='ENOBUFS';throw err;
 }}),/review budget/);
 assert.throws(()=>readPatch('short',b,{run}),PatchReadError);
});

test('real 2 MiB binary Git PR emits a structured INCONCLUSIVE artifact, never ENOBUFS',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'world-review-binary-'));
 const git=(...args)=>{
  const result=cp.spawnSync('git',args,{cwd:tmp,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  return result.stdout.trim();
 };
 try{
  git('init','-q');
  git('config','user.name','Test');
  git('config','user.email','test@example.invalid');
  fs.writeFileSync(path.join(tmp,'README.md'),'baseline\n');
  git('add','README.md');git('commit','-qm','baseline');
  const base=git('rev-parse','HEAD');
  fs.writeFileSync(path.join(tmp,'model.glb'),crypto.randomBytes(2*1024*1024));
  git('add','model.glb');git('commit','-qm','add binary model');
  const head=git('rev-parse','HEAD');
  const output=path.join(tmp,'report.json');
  const gate=path.join(__dirname,'..','scripts','independent-review-gate.cjs');
  const child=cp.spawnSync(process.execPath,[gate,'--base',base,'--head',head,
   '--output',output],{cwd:tmp,encoding:'utf8',timeout:20000,
   env:{...process.env,WORLD_REVIEW_KEY:'',CLOUDFLARE_API_TOKEN:''}});
  assert.equal(child.status,2,child.stderr);
  assert.ok(!child.stderr.includes('ENOBUFS'));
  const report=JSON.parse(fs.readFileSync(output,'utf8'));
  assert.equal(report.verdict,'INCONCLUSIVE');
  assert.equal(report.reviewers.length,0);
  assert.match(report.blockers.join(' '),/Binary change requires separate asset/);
  assert.equal(report.diffSha256,null);
 }finally{
  fs.rmSync(tmp,{recursive:true,force:true});
 }
});
