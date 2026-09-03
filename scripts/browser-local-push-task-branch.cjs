#!/usr/bin/env node
'use strict';
const cp = require('child_process');
const branch = String(process.argv[2] || '').trim();
if (!/^browser-task\/task_[a-zA-Z0-9]+$/.test(branch)) {
  console.error('refusing non browser-task branch');
  process.exit(2);
}
const check = cp.spawnSync('git',['show-ref','--verify','--quiet',`refs/heads/${branch}`],{encoding:'utf8',windowsHide:true});
if (check.status !== 0) { console.error(`local branch not found: ${branch}`); process.exit(3); }
const r = cp.spawnSync('git',['push','-u','origin',branch],{encoding:'utf8',windowsHide:true,timeout:60000});
console.log(JSON.stringify({branch,status:r.status,stdout:String(r.stdout||'').slice(0,4000),stderr:String(r.stderr||'').slice(0,4000)},null,2));
process.exit(r.status === 0 ? 0 : 1);
