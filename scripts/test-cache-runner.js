#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto'),cp=require('child_process');const ROOT=process.cwd(),args=process.argv.slice(2);
if(!args.length){
  try{ const { test } = require('node:test'); test('test-cache-runner skipped when run via node --test (requires command args)', { skip: true }, () => {}); }catch{}
  if(process.argv.includes('--test') || process.env.NODE_TEST_CONTEXT || !process.argv.slice(2).length){
    // Running as a test file discovery - don't throw
    return;
  }
  throw new Error('usage: test-cache-runner <command...>');
}
const command=args.join(' '),inputs=(process.env.QUALITY_TEST_INPUTS||'').split(',').map(x=>x.trim()).filter(Boolean),hash=crypto.createHash('sha256');hash.update(command);hash.update(process.version);
for(const f of ['package.json','package-lock.json',...inputs]){const p=path.join(ROOT,f);if(fs.existsSync(p)){hash.update(f);hash.update(fs.readFileSync(p))}}
const key=hash.digest('hex'),dir=path.join(ROOT,'.quality-cache','tests'),file=path.join(dir,key+'.json'),maxMs=Number(process.env.QUALITY_TEST_CACHE_HOURS||168)*3600000;fs.mkdirSync(dir,{recursive:true});
if(fs.existsSync(file)){const j=JSON.parse(fs.readFileSync(file,'utf8'));if(j.pass&&Date.now()-new Date(j.createdAt).getTime()<maxMs){console.log('[TEST_CACHE] HIT '+key.slice(0,12)+' '+command);fs.writeFileSync(path.join(ROOT,'TEST_CACHE_LAST.json'),JSON.stringify({...j,cacheHit:true},null,2)+'\n');process.exit(0)}}
console.log('[TEST_CACHE] MISS '+key.slice(0,12)+' '+command);const r=cp.spawnSync(command,{cwd:ROOT,shell:true,stdio:'inherit',env:process.env});const rec={createdAt:new Date().toISOString(),key,command,inputs,pass:r.status===0,status:r.status,cacheHit:false};fs.writeFileSync(file,JSON.stringify(rec,null,2)+'\n');fs.writeFileSync(path.join(ROOT,'TEST_CACHE_LAST.json'),JSON.stringify(rec,null,2)+'\n');process.exit(r.status||0);
