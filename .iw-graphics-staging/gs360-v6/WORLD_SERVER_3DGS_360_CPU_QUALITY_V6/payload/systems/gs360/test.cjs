#!/usr/bin/env node
'use strict';
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');
const here = __dirname;

function run(cmd,args,opts={}) {
  const r=spawnSync(cmd,args,{stdio:opts.capture?'pipe':'inherit',encoding:'utf8'});
  if(r.status!==0){
    if(opts.capture){ if(r.stdout) process.stdout.write(r.stdout); if(r.stderr) process.stderr.write(r.stderr); }
    process.exit(r.status ?? 1);
  }
}

const nodeFiles=['run.cjs','setup.cjs','test.cjs','resource-advisor.cjs','wait-and-verify.cjs','autopilot.cjs','health-check.cjs','quality.cjs','backend-registry.cjs','trainer-runner.cjs','job-queue.cjs','system-test.cjs','doctor.cjs','storage-manager.cjs','splat-optimizer.cjs','consistency.cjs','fingerprint.cjs','depth-registry.cjs','license-gate.cjs','next-action.cjs','resource-benchmark.cjs'];
for(const f of nodeFiles) run(process.execPath,['--check',path.join(here,f)]);

const venv = process.platform === 'win32' ? path.join(here,'.venv','Scripts','python.exe') : path.join(here,'.venv','bin','python');
const options = fs.existsSync(venv) ? [[venv,[]]] : (process.platform === 'win32' ? [['python',[]],['py',['-3']]] : [['python3',[]],['python',[]]]);
let chosen = null;
for (const [cmd,prefix] of options) {
  const t = spawnSync(cmd,[...prefix,'-c','import numpy,PIL'],{stdio:'ignore'});
  if (t.status === 0) { chosen=[cmd,prefix]; break; }
}
if (!chosen) { console.error('[GS360] dependencies missing; run npm run gs360:setup'); process.exit(2); }
const [cmd,prefix] = chosen;
run(cmd,[...prefix,'-m','unittest','discover','-s',path.join(here,'tests'),'-p','test_*.py','-v']);
run(process.execPath,[path.join(here,'system-test.cjs')]);
console.log('[GS360 TEST] PASS');
