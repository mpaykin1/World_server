#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),http=require('http'),https=require('https');
const root=path.resolve(process.argv[2]||process.cwd()),url=process.argv.find(x=>/^https?:\/\//.test(x));
const must=['apps/dark-void-scene/index.html','apps/dark-void-scene/client.js','shared/dark-void-science-journey.mjs','shared/dark-void-infinite-runtime.mjs','shared/dark-void-distance-streamer.mjs','shared/dark-void-counterfactual-ghost.mjs','shared/dark-void-science-evidence.mjs'];
let ok=true;for(const f of must){const e=fs.existsSync(path.join(root,f));console.log(e?'PASS':'FAIL',f);ok&&=e}
const html=fs.existsSync(path.join(root,must[0]))?fs.readFileSync(path.join(root,must[0]),'utf8'):'';
for(const [name,re] of [['lang=en',/lang="en"/],['viewport-fit-cover',/viewport-fit=cover/]]){const p=re.test(html);console.log(p?'PASS':'FAIL',name);ok&&=p}
if(!url){console.log('BLOCKED live URL not supplied; local preflight only');process.exit(ok?0:1)}
const lib=url.startsWith('https:')?https:http;const req=lib.get(url,{headers:{'user-agent':'WorldServer-DarkVoid-Healthcheck/1'}},r=>{let body='';r.setEncoding('utf8');r.on('data',d=>body+=d.slice(0,20000));r.on('end',()=>{const live=r.statusCode<400&&/Dark Void|Navigator/i.test(body);console.log(live?'PASS':'FAIL','live URL',r.statusCode,url);process.exit(ok&&live?0:1)})});req.setTimeout(10000,()=>req.destroy(new Error('timeout')));req.on('error',e=>{console.error('FAIL live URL',e.message);process.exit(1)});
