#!/usr/bin/env node
'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),os=require('node:os');
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'shared','vendor'),VERSION='2.0.0';
const items=[
  {name:'opentype.module.js',url:`https://unpkg.com/opentype.js@${VERSION}/dist/opentype.module.js`,min:100000},
  {name:'opentype-LICENSE.txt',url:`https://raw.githubusercontent.com/opentypejs/opentype.js/${VERSION}/LICENSE`,min:500}
];
function curl(url){for(const b of process.platform==='win32'?['curl.exe','curl']:['curl']){const r=cp.spawnSync(b,['-L','--fail','--silent','--show-error','--max-time','120',url],{encoding:null,maxBuffer:16*1024*1024,windowsHide:true});if(r.status===0&&r.stdout?.length)return Buffer.from(r.stdout)}return null}
async function direct(url){let last;for(let i=0;i<3;i++){const ac=new AbortController(),t=setTimeout(()=>ac.abort(),90000);try{const r=await fetch(url,{headers:{'user-agent':'WorldServer-InkGlyphWorld/2.0'},signal:ac.signal});if(!r.ok)throw new Error(`HTTP ${r.status}`);return Buffer.from(await r.arrayBuffer())}catch(e){last=e;await new Promise(r=>setTimeout(r,700*(i+1)))}finally{clearTimeout(t)}}const c=curl(url);if(c)return c;throw last||new Error('direct download failed')}
function npmFallback(){
  const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'igw-opentype-'));
  try{
    const npm=process.platform==='win32'?'npm.cmd':'npm';
    const r=cp.spawnSync(npm,['install','--prefix',tmp,'--no-audit','--no-fund','--ignore-scripts','--package-lock=false',`opentype.js@${VERSION}`],{stdio:'inherit',windowsHide:true,timeout:120000});
    if(r.status!==0)return null;
    const base=path.join(tmp,'node_modules','opentype.js'),modulePath=path.join(base,'dist','opentype.module.js'),licensePath=path.join(base,'LICENSE');
    if(!fs.existsSync(modulePath)||!fs.existsSync(licensePath))return null;
    return {'opentype.module.js':fs.readFileSync(modulePath),'opentype-LICENSE.txt':fs.readFileSync(licensePath)};
  }finally{fs.rmSync(tmp,{recursive:true,force:true})}
}
(async()=>{
  fs.mkdirSync(OUT,{recursive:true});const buffers={};let directOk=true;
  for(const it of items){try{buffers[it.name]=await direct(it.url)}catch(e){console.warn(`WARN direct ${it.name} failed: ${e.message}`);directOk=false;break}}
  if(!directOk){const viaNpm=npmFallback();if(!viaNpm)throw new Error('direct/curl failed and isolated npm fallback failed');Object.assign(buffers,viaNpm);console.warn('WARN vendor recovered through isolated npm fallback')}
  for(const it of items){const b=buffers[it.name];if(!b||b.length<it.min)throw new Error(`${it.name} too small: ${b?.length||0}`);if(it.name.endsWith('.js')&&!b.toString('utf8',0,30000).toLowerCase().includes('opentype'))throw new Error('unexpected opentype module payload');const tmp=path.join(OUT,it.name+'.tmp');fs.writeFileSync(tmp,b);fs.renameSync(tmp,path.join(OUT,it.name));console.log(`PASS ${it.name} ${b.length} bytes`)}
  fs.writeFileSync(path.join(OUT,'opentype-MANIFEST.json'),JSON.stringify({schemaVersion:1,name:'opentype.js',version:VERSION,source:'https://github.com/opentypejs/opentype.js',installedAt:new Date().toISOString()},null,2)+'\n');
  console.log(`INK_GLYPH_VENDOR PASS opentype.js@${VERSION}`);
})().catch(e=>{console.error(`INK_GLYPH_VENDOR FAIL: ${e.stack||e}`);process.exit(1)});
