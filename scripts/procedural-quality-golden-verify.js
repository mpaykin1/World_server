#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');const root=path.resolve(__dirname,'..'),f=path.join(root,'PROCEDURAL_GOLDEN_BASELINES.json');
if(!fs.existsSync(f)){console.log(JSON.stringify({version:10,pass:false,recorded:false,note:'record baselines after Preview/local server'}));if(process.env.PROCEDURAL_GOLDEN_REQUIRED==='1')process.exit(1);process.exit(0)}
const j=JSON.parse(fs.readFileSync(f,'utf8')),rows=Array.isArray(j.rows)?j.rows:[],pass=rows.length>0&&rows.every(r=>/^[a-f0-9]{64}$/.test(r.sha256||'')&&r.metrics?.width>0&&r.metrics?.height>0);
const out={version:10,pass,recorded:true,count:rows.length};console.log(JSON.stringify(out,null,2));if(!pass)process.exit(1);
