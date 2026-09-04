'use strict';
const cp=require('child_process'),fs=require('fs'),path=require('path');const ROOT=process.cwd();
function run(cmd,args,opts={}){const r=cp.spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',stdio:opts.inherit?'inherit':'pipe',windowsHide:true,timeout:opts.timeout||180000,shell:false});if(r.error)throw r.error;if(r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed: ${(r.stderr||r.stdout||'').slice(-5000)}`);return String(r.stdout||'').trim();}
const branch=run('git',['branch','--show-current']);if(branch!=='browser-task/task_chatgpt_creature_runtime_v8_1702')throw new Error('unexpected branch '+branch);
run(process.execPath,['--test','test/creature-factory-master.test.js','test/creature-runtime-optimizer.test.js','test/creature-runtime-engine.test.js'],{inherit:true});
run(process.execPath,['scripts/creature-runtime-benchmark.cjs','--strict'],{inherit:true});
run(process.execPath,['scripts/creature-runtime-engine-benchmark.cjs'],{inherit:true});
if(process.platform==='win32')run(process.env.ComSpec||'C:/Windows/System32/cmd.exe',['/d','/s','/c','npm run check'],{inherit:true,timeout:180000});else run('npm',['run','check'],{inherit:true,timeout:180000});
run('git',['add','lib/creature-factory/runtime-engine.js','lib/creature-factory/index.js','test/creature-runtime-engine.test.js','scripts/creature-runtime-engine-benchmark.cjs']);
const status=run('git',['status','--porcelain=v1']);if(status){run('git',['commit','-m','feat(creature): integrate adaptive cached runtime hot loop'],{inherit:true});}
run('git',['push','-u','origin',branch],{inherit:true});
console.log(JSON.stringify({status:'PASS',branch,head:run('git',['rev-parse','HEAD']),master:run('git',['rev-parse','origin/master'])}));
