'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),cp=require('node:child_process');
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/quality-autofix-pr.yml'),'utf8');
const match=workflow.match(/        run: \|\n([\s\S]+?)      - uses: actions\/setup-node/);
if(!match)throw Error('Admission step missing');
const body=match[1].split('\n').map(line=>line.replace(/^          /,'')).join('\n');
const bash=process.platform==='win32'?'C:/Program Files/Git/bin/bash.exe':'bash';
for(const [count,expected] of [['0',0],['4',0],['5',73],['100',73],['bad',73]]){
test('auto-fix admission count '+count+' preserves explicit gate outcome',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'autofix-admission-'));
 try {
  const output=path.join(root,'output').replaceAll('\\','/'),summary=path.join(root,'summary').replaceAll('\\','/');
  const script='gh(){ printf "%s\\n" "$TEST_PR_COUNT"; }\n'+body;
  const run=cp.spawnSync(bash,['--noprofile','--norc','-c',script],{encoding:'utf8',env:{...process.env,GH_TOKEN:'',GITHUB_REPOSITORY:'mpaykin1/World_server',GITHUB_OUTPUT:output,GITHUB_STEP_SUMMARY:summary,TEST_PR_COUNT:count}});
  assert.equal(run.status,expected,run.stdout+run.stderr);
  if(expected===0)assert.match(fs.readFileSync(output,'utf8'),/admitted=true/);
  if(count==='5'||count==='100'){assert.match(fs.readFileSync(output,'utf8'),/admitted=false/);assert.match(fs.readFileSync(summary,'utf8'),/TASK_BLOCKED_PR_BUDGET/);}
 }finally{
  const resolved=path.resolve(root),tempRoot=path.resolve(os.tmpdir());
  if(!resolved.startsWith(tempRoot+path.sep)||!path.basename(resolved).startsWith('autofix-admission-'))throw Error('Unexpected fixture cleanup path');
  for(const name of ['output','summary']){const file=path.join(resolved,name);if(fs.existsSync(file))fs.unlinkSync(file);}
  fs.rmdirSync(resolved);
 }
});
}
