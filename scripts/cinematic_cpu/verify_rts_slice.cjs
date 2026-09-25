#!/usr/bin/env node
/**
 * Streaming exact-worktree RTS graphics preflight.
 * Never buffers a large git diff (avoids Independent Review ENOBUFS failure).
 * Browser mode requires an existing local server and Playwright installation.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const ROOT=path.resolve(__dirname,'..','..');
const NODE=process.execPath,runBrowser=process.argv.includes('--browser');
const relative=loc=>path.join(ROOT,loc);
function execute(command,args,label){
 return new Promise((resolve,reject)=>{
  console.log('\n[RTS_PREFLIGHT_START]',label);
  const child=spawn(command,args,{cwd:ROOT,env:process.env,
   stdio:'inherit',windowsHide:true});
  child.once('error',reject);
  child.once('exit',(code,signal)=>{
   if(code===0){console.log('[RTS_PREFLIGHT_PASS]',label);resolve();}
   else reject(Error(label+' exited '+code+(signal?' signal '+signal:'')));
  });
 });
}
async function main(){
 const unitFiles=fs.readdirSync(relative('test'))
  .filter(name=>/^cinematic-(cpu|rts|strategy).*\.test\.mjs$/.test(name))
  .sort().map(name=>path.join('test',name));
 if(unitFiles.length<8)throw Error('critical RTS test files missing');
 console.log('[RTS_PREFLIGHT_EXACT_HEAD]');
 await execute('git',['rev-parse','HEAD'],'EXACT_HEAD');
 const modules=fs.readdirSync(relative('apps/ai3d-voxel-city'))
  .filter(name=>name.startsWith('cinematic-')&&name.endsWith('.mjs'))
  .sort().map(name=>path.join('apps','ai3d-voxel-city',name));
 for(const moduleName of [...modules,'apps/ai3d-voxel-city/client.js'])
  await execute(NODE,['--check',moduleName],'syntax '+moduleName);
 await execute(NODE,['scripts/check-js.js'],'repository syntax');
 await execute(NODE,['--test',...unitFiles],'all CPU/RTS/strategy tests');
 await execute(NODE,['scripts/cinematic_cpu/verify_pack.cjs'],'GLB/SHA/LOD');
 await execute('git',['diff','--check'],'working diff hygiene');
 await execute('git',['diff','--cached','--check'],'staged diff hygiene');
 if(runBrowser){
  if(!process.env.PLAYWRIGHT_BASE_URL)
   throw Error('--browser requires PLAYWRIGHT_BASE_URL (running local server)');
  const cli=process.env.PLAYWRIGHT_CLI||
   relative('node_modules/@playwright/test/cli.js');
  if(!fs.existsSync(cli))
   throw Error('Playwright CLI missing; set PLAYWRIGHT_CLI explicitly');
  await execute(NODE,[cli,'test','e2e/cinematic-cpu-preview.spec.js',
   'e2e/cinematic-rts-volcanic.spec.js','--project=desktop-chromium',
   '--project=mobile-chromium','--workers=1','--reporter=line'],
   'desktop + mobile-emulated WebGL E2E');
 }else{
  console.log('[RTS_BROWSER_NOT_RUN] Supply --browser with server/CLI.');
 }
 console.log('[RTS_SOURCE_TESTED_ONLY] Physical phone, independent review,');
 console.log('user visibility >=85%, protected-master integration, deploy');
 console.log('and live game-state/collisions still require independent proof.');
}
main().catch(error=>{
 console.error('[RTS_PREFLIGHT_FAILED]',error.message);
 process.exitCode=1;
});
