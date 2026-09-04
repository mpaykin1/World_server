'use strict';
const cp=require('child_process'),path=require('path');
const ROOT=path.resolve(__dirname,'..');
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',stdio:opts.inherit?'inherit':'pipe',windowsHide:true});if(r.error){console.error(r.error.message);process.exit(2);}if(r.status!==0){console.error((r.stderr||r.stdout||'').trim());process.exit(r.status||2);}return String(r.stdout||'').trim();}
const branch=run('git',['branch','--show-current']);
if(!branch || branch==='master'){console.error('SYNC_ABORT: master/direct work forbidden');process.exit(3);}
const top=run('git',['rev-parse','--show-toplevel']).replace(/\\/g,'/').toLowerCase();
if(!top.includes('/state/browser-local-worktrees/')){console.error('SYNC_ABORT: isolated bridge worktree required');process.exit(4);}
run('git',['fetch','origin','master']);
const before=run('git',['rev-parse','HEAD']);
run('git',['merge','--no-edit','origin/master'],{inherit:true});
const after=run('git',['rev-parse','HEAD']);
run(process.execPath,['--test','test/creature-factory-master.test.js'],{inherit:true});
run(process.execPath,['scripts/creature-runtime-benchmark.cjs','--strict'],{inherit:true});
if(process.platform==='win32') run(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm run check'],{inherit:true});
else run('npm',['run','check'],{inherit:true});
console.log(JSON.stringify({status:'PASS',branch,before,after,master:run('git',['rev-parse','origin/master'])}));
