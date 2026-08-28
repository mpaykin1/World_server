#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {spawnSync}=require('node:child_process');
const here=__dirname;const root=path.resolve(process.argv[2]||process.cwd());const repair=process.argv.includes('--repair');const full=process.argv.includes('--full');
function run(name,args,inherit=false,timeout=90000){const r=spawnSync(process.execPath,args,{encoding:'utf8',cwd:root,stdio:inherit?'inherit':'pipe',timeout});return{name,pass:r.status===0,status:r.status,signal:r.signal||null,stdoutTail:(r.stdout||'').slice(-5000),stderrTail:(r.stderr||'').slice(-5000)};}
const report={schema:'world-server.gs360-doctor/v3',generatedAt:new Date().toISOString(),repair,full,steps:[],pass:false};
report.steps.push(run('recover-stale',[path.join(here,'job-queue.cjs'),'recover-stale','--root',root,'--stale-seconds','3600']));
let health=run('health',[path.join(here,'health-check.cjs'),root]);report.steps.push(health);
let system=run('system-test',[path.join(here,'system-test.cjs')]);report.steps.push(system);
let tests={pass:true,status:0,name:'full-tests-skipped'};
if(full){tests=run('full-tests',[path.join(here,'test.cjs')],false,180000);report.steps.push(tests);}
if(repair&&(!health.pass||!system.pass||!tests.pass)){
  const setup=run('setup-repair',[path.join(here,'setup.cjs')],true,180000);report.steps.push(setup);
  health=run('health-after-repair',[path.join(here,'health-check.cjs'),root]);report.steps.push(health);
  system=run('system-test-after-repair',[path.join(here,'system-test.cjs')]);report.steps.push(system);
  if(full){tests=run('full-tests-after-repair',[path.join(here,'test.cjs')],false,180000);report.steps.push(tests);}
}
for(const [name,script] of [['backend-registry','backend-registry.cjs'],['depth-registry','depth-registry.cjs'],['license-gate','license-gate.cjs'],['resource-plan','resource-advisor.cjs']])report.steps.push(run(name,[path.join(here,script),root]));
report.pass=health.pass&&system.pass&&tests.pass;report.status=report.pass?'HEALTHY':(repair?'REPAIR_INCOMPLETE':'NEEDS_REPAIR');report.finishedAt=new Date().toISOString();report.rule='Run npm run test:gs360 as a separate mandatory gate. Use doctor --full only when a combined diagnostic is explicitly needed.';const out=path.join(root,'GS360_DOCTOR_REPORT.json');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n','utf8');console.log(JSON.stringify(report,null,2));process.exit(report.pass?0:1);
