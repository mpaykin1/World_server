#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');const ROOT=process.cwd(),map=JSON.parse(fs.readFileSync(path.join(ROOT,'data/incremental-test-map.json'),'utf8'));
let changed=process.env.QUALITY_CHANGED_FILES?process.env.QUALITY_CHANGED_FILES.split(/[,\n]/).map(x=>x.trim()).filter(Boolean):[];
if(!changed.length){const r=cp.spawnSync('git',['diff','--name-only',process.env.QUALITY_BASE_SHA||'master','HEAD'],{cwd:ROOT,encoding:'utf8'});if(r.status===0)changed=r.stdout.trim().split(/\r?\n/).filter(Boolean)}
const tests=new Set(['test/quality-regression.test.js']);
for(const f of changed){for(const [prefix,arr] of Object.entries(map)){if(f===prefix||f.startsWith(prefix))for(const t of arr)tests.add(t)}if(f.startsWith('apps/')){tests.add('e2e/golden-ui-quality.spec.js');tests.add('e2e/golden-mobile-behavior.spec.js')}}
const existing=[...tests].filter(t=>fs.existsSync(path.join(ROOT,t)));
const out={generatedAt:new Date().toISOString(),changed,tests:existing,fullSuiteRequired:changed.some(f=>f.startsWith('.github/')||f==='package.json'||f==='vercel.json')};
fs.writeFileSync(path.join(ROOT,'INCREMENTAL_TEST_PLAN.json'),JSON.stringify(out,null,2)+'\n');console.log(`[INCREMENTAL_TESTS] changed=${changed.length} selected=${existing.length} full=${out.fullSuiteRequired}`);
