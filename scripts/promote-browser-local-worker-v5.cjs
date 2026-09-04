'use strict';
const cp=require('child_process');
function run(args){const r=cp.spawnSync('git',args,{encoding:'utf8',windowsHide:true});if(r.status!==0){console.error(r.stderr||r.stdout);process.exit(2);}return String(r.stdout||'').trim();}
const expected='315ae0dfe80b597f6c9a84bbf8d80c1de43b32cc';
const remoteLine=run(['ls-remote','origin','refs/heads/ai/opencode/browser-local-control']);const remote=(remoteLine.split(/\s+/)[0]||'');
if(remote!==expected){console.error(`PROMOTE_ABORT remote=${remote} expected=${expected}`);process.exit(3);}
const head=run(['rev-parse','HEAD']);run(['push','origin',`HEAD:refs/heads/ai/opencode/browser-local-control`]);console.log(JSON.stringify({status:'PASS',from:remote,to:head,force:false}));
