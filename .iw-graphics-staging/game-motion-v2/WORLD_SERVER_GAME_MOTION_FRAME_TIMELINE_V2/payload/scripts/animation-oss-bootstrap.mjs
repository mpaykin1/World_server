#!/usr/bin/env node
import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';
const ROOT=process.cwd(),toolRoot=path.join(ROOT,'tools/game-motion'),vendor=path.join(toolRoot,'vendor'),nodeRoot=path.join(toolRoot,'node');
fs.mkdirSync(vendor,{recursive:true});fs.mkdirSync(nodeRoot,{recursive:true});
const run=(cmd,args,opts={})=>{const r=spawnSync(cmd,args,{stdio:'inherit',shell:false,...opts});if(r.error||r.status!==0)throw new Error(`${cmd} ${args.join(' ')} failed (${r.status??r.error})`);return r};
function findPython(){const c=process.platform==='win32'?[['py',['-3']],['python',[]],['python3',[]]]:[['python3',[]],['python',[]]];for(const [cmd,prefix] of c){const r=spawnSync(cmd,[...prefix,'--version'],{encoding:'utf8'});if(!r.error&&r.status===0)return{cmd,prefix}}throw new Error('Python 3 not found')}
const py=findPython(),venv=path.join(toolRoot,'.venv');console.log('[BOOTSTRAP] Python isolated environment');
if(!fs.existsSync(venv))run(py.cmd,[...py.prefix,'-m','venv',venv]);
const vpy=process.platform==='win32'?path.join(venv,'Scripts','python.exe'):path.join(venv,'bin','python');
run(vpy,['-m','pip','install','--upgrade','pip']);run(vpy,['-m','pip','install','-r',path.join(toolRoot,'requirements.txt')]);
console.log('[BOOTSTRAP] Isolated Node animation tooling: glTF-Transform + meshoptimizer');
if(!fs.existsSync(path.join(nodeRoot,'package.json')))fs.writeFileSync(path.join(nodeRoot,'package.json'),JSON.stringify({private:true,name:'world-server-game-motion-tools',version:'1.0.0'},null,2)+'\n');
run(process.platform==='win32'?'npm.cmd':'npm',['install','--prefix',nodeRoot,'--no-audit','--no-fund','@gltf-transform/cli@^4','meshoptimizer@^1']);
const air=path.join(vendor,'aironzak-instagram');
if(!fs.existsSync(path.join(air,'.git'))){console.log('[BOOTSTRAP] Clone MIT roomwalk/exploded reference');run('git',['clone','--depth','1','https://github.com/Aironzak/instagram.git',air])}
else{run('git',['-C',air,'fetch','--depth','1','origin','main']);run('git',['-C',air,'reset','--hard','origin/main'])}
run(vpy,[path.join(toolRoot,'verify_pipeline.py')]);run(process.execPath,[path.join(ROOT,'scripts/game-motion-gltf-toolcheck.mjs')]);
console.log('[BOOTSTRAP] PASS all required free/open-source animation tooling installed.');
