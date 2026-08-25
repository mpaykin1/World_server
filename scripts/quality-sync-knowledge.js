#!/usr/bin/env node
'use strict';
const fs=require('node:fs');const path=require('node:path');const {createAdminClient}=require('../lib/env');const {persistRun,persistRegressionKb}=require('../lib/quality/knowledge-store');
function arg(n,d){const i=process.argv.indexOf(n);return i>=0&&process.argv[i+1]?process.argv[i+1]:d;}function read(f,d){try{return JSON.parse(fs.readFileSync(f,'utf8'));}catch{return d;}}
(async()=>{const run=read(arg('--run','quality-report.json'),null);if(!run)throw new Error('quality run report missing');const kb=read(arg('--kb',path.join('data','quality-autopilot','global-regression-kb.json')),{rules:[]});const admin=createAdminClient();const key=await persistRun(admin,run,{source:'quality-autopilot-v3'});const count=await persistRegressionKb(admin,kb);console.log(`[QUALITY_KNOWLEDGE_SYNC] run=${key} kbRules=${count}`);})().catch(e=>{console.error(e);process.exitCode=2;});
