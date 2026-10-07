'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const cp=require('node:child_process');

const script=path.resolve(__dirname,'../scripts/check-desktop-ai-protocol.js');

function fixture(t,wip){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'desktop-ai-protocol-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  fs.mkdirSync(path.join(root,'data'));
  fs.writeFileSync(path.join(root,'data','desktop-ai-policy.json'),JSON.stringify({
    requiredFiles:['DESKTOP_AI_INSTALL_AND_VERIFY.md','WORK_IN_PROGRESS.md'],
    workFile:'WORK_IN_PROGRESS.md',
    requiredSections:['Task','Final evidence']
  }));
  fs.writeFileSync(path.join(root,'DESKTOP_AI_INSTALL_AND_VERIFY.md'),'installed\n');
  fs.writeFileSync(path.join(root,'WORK_IN_PROGRESS.md'),wip);
  return root;
}

function run(root){
  return cp.spawnSync(process.execPath,[script],{
    cwd:root,encoding:'utf8',
    env:{...process.env,DESKTOP_AI_CHANGED_FILES:'lib/example.js,WORK_IN_PROGRESS.md'}
  });
}

test('historical UNSET does not block a completed current task',t=>{
  const root=fixture(t,'## Task\nHistorical task\nUNSET\n## Final evidence\nHistorical evidence\n\n---\n## Task\nCurrent task\n## Final evidence\nPASS\n');
  const result=run(root);
  assert.equal(result.status,0,result.stderr||result.stdout);
});

test('UNSET in current task still fails closed',t=>{
  const root=fixture(t,'## Task\nHistorical task\n## Final evidence\nPASS\n\n---\n## Task\nCurrent task UNSET\n## Final evidence\nPASS\n');
  const result=run(root);
  assert.equal(result.status,61);
  assert.match(result.stderr,/current task still contains UNSET/);
});
