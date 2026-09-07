'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const ROOT=path.resolve(__dirname,'..');

test('Vercel Hobby function count stays within hard limit',()=>{
  const files=fs.readdirSync(path.join(ROOT,'api')).filter(f=>f.endsWith('.js'));
  assert.ok(files.length<=12,`api/*.js=${files.length}, Hobby max=12`);
  for(const name of ['register.js','login.js','me.js','logout.js']) assert.ok(!files.includes(name));
  assert.ok(files.includes('auth.js'));
});

test('auth public URLs are preserved through one router',()=>{
  const cfg=JSON.parse(fs.readFileSync(path.join(ROOT,'vercel.json'),'utf8'));
  const map=new Map((cfg.rewrites||[]).map(r=>[r.source,r.destination]));
  for(const name of ['register','login','me','logout']) assert.equal(map.get(`/api/${name}`),`/api/auth?__route=${name}`);
  const server=fs.readFileSync(path.join(ROOT,'server.js'),'utf8');
  for(const name of ['register','login','me','logout']) assert.ok(server.includes(`require('./lib/api-handlers/${name}')`));
});

test('auth router fails closed on unknown route',async()=>{
  const handler=require('../api/auth'); let status=0,body='';
  const res={setHeader(){},end(v){body=String(v||'')},set statusCode(v){status=v},get statusCode(){return status}};
  await handler({url:'/api/auth?__route=nope',headers:{host:'localhost'}},res);
  assert.equal(status,404); assert.match(body,/error/);
});
