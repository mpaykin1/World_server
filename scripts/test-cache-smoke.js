#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');const ROOT=process.cwd();
const plan=fs.existsSync(path.join(ROOT,'INCREMENTAL_TEST_PLAN.json'))?JSON.parse(fs.readFileSync(path.join(ROOT,'INCREMENTAL_TEST_PLAN.json'),'utf8')):{changed:[],tests:[]};
const unit=(plan.tests||[]).filter(x=>x.startsWith('test/')&&fs.existsSync(path.join(ROOT,x)));
if(!unit.length){console.log('[TEST_CACHE_SMOKE] no selected unit tests');process.exit(0)}
const cmd=`node --test ${unit.map(x=>JSON.stringify(x)).join(' ')}`,inputs=[...(plan.changed||[]),...unit].join(',');
const r=cp.spawnSync(process.execPath,[path.join(ROOT,'scripts/test-cache-runner.js'),cmd],{cwd:ROOT,stdio:'inherit',env:{...process.env,QUALITY_TEST_INPUTS:inputs}});
process.exit(r.status||0);
