'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('fs'),os=require('os'),path=require('path'),cp=require('child_process');
const { validateAllowedFileChanges, allowedPathMatches, collectTaskFilesChanged }=require('../scripts/browser-local-worker.cjs');
function git(cwd,args){const r=cp.spawnSync('git',args,{cwd,encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr||r.stdout);return String(r.stdout||'').trim()}
function repo(){const d=fs.mkdtempSync(path.join(os.tmpdir(),'ws-dispatch-integrity-'));git(d,['init']);git(d,['config','user.email','test@example.invalid']);git(d,['config','user.name','test']);return d}
test('allowedPaths rejects real out-of-scope patterns while preserving directory/prefix semantics',()=>{
 const bad=validateAllowedFileChanges(['scripts/browser-local-worker.cjs','.gitignore'],['scripts/browser-local-worker.cjs']);
 assert.equal(bad.ok,false);assert.deepEqual(bad.outOfScope,['.gitignore']);
 assert.equal(allowedPathMatches('lib/creature-factory/index.js','lib/creature-factory/'),true);
 assert.equal(allowedPathMatches('scripts/creature-benchmark.cjs','scripts/creature-'),true);
 assert.equal(allowedPathMatches('scripts/other.cjs','scripts/creature-'),false);
});
test('baseline commit is never misreported as current task work',()=>{
 const d=repo();try{
  fs.writeFileSync(path.join(d,'first.txt'),'a');git(d,['add','.']);git(d,['commit','-m','first']);
  fs.writeFileSync(path.join(d,'baseline.txt'),'b');git(d,['add','.']);git(d,['commit','-m','baseline']);
  const baseline=git(d,['rev-parse','HEAD']);
  assert.deepEqual(collectTaskFilesChanged(d,baseline),[]);
  fs.writeFileSync(path.join(d,'task.txt'),'c');
  assert.deepEqual(collectTaskFilesChanged(d,baseline),['task.txt']);
 }finally{fs.rmSync(d,{recursive:true,force:true})}
});