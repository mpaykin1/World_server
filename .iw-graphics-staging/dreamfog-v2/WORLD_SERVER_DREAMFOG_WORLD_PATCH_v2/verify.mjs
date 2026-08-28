import fs from 'node:fs';import path from 'node:path';import process from 'node:process';import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);function arg(name,fallback=null){const i=args.indexOf(name);return i>=0&&args[i+1]&&!args[i+1].startsWith('--')?args[i+1]:fallback;}
const repo=path.resolve(arg('--repo',process.cwd()));const full=args.includes('--full');const noInstall=args.includes('--no-install');
const report={contract:'DREAMFOG_VERIFICATION_V2',createdAt:new Date().toISOString(),repo,full,passed:false,commands:[],notes:[]};
function run(label,cmd,cmdArgs,{optional=false}={}){const t=Date.now();const r=spawnSync(cmd,cmdArgs,{cwd:repo,encoding:'utf8',shell:process.platform==='win32',env:{...process.env,CI:'1'}});const item={label,command:[cmd,...cmdArgs].join(' '),exitCode:r.status,durationMs:Date.now()-t,passed:r.status===0,optional,stdout:(r.stdout||'').slice(-12000),stderr:(r.stderr||'').slice(-12000)};report.commands.push(item);console.log(`${item.passed?'PASS':'FAIL'} ${label}`);if(!item.passed&&!optional)return false;return true;}
if(!fs.existsSync(path.join(repo,'package.json')))throw new Error('package.json not found at repo root');
let ok=true;
if(!noInstall){ok=run('npm install','npm',['install'])&&ok;}
ok=run('DreamFog static gate','npm',['run','dreamfog:static'])&&ok;
ok=run('DreamFog node tests','node',['--test','test/dreamfog-config.test.js'])&&ok;
ok=run('World_server code tests','npm',['run','check'])&&ok;
ok=run('Duplicate systems gate','npm',['run','duplicates:check'])&&ok;
ok=run('System contracts gate','npm',['run','contracts:check'])&&ok;
ok=run('DreamFog Playwright desktop+mobile','npm',['run','dreamfog:e2e'])&&ok;
if(full){
  ok=run('Golden standard','npm',['run','golden:check'])&&ok;
  ok=run('World runtime quality','npm',['run','quality:world:runtime'])&&ok;
  ok=run('World visibility quality','npm',['run','quality:world:visibility'])&&ok;
  ok=run('World device matrix','npm',['run','quality:world:devices'])&&ok;
  ok=run('Regression capture','npm',['run','regressions:capture'])&&ok;
  ok=run('Release gate','npm',['run','release:gate'])&&ok;
}
report.passed=ok;report.summary={passed:report.commands.filter(x=>x.passed).length,failed:report.commands.filter(x=>!x.passed&&!x.optional).length,total:report.commands.length};
fs.writeFileSync(path.join(repo,'DREAMFOG_VERIFICATION_REPORT.json'),JSON.stringify(report,null,2)+'\n','utf8');
console.log(JSON.stringify(report.summary));process.exit(ok?0:1);
