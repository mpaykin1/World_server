#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');
const ROOT=process.cwd(),required=['data/quality-scorecard.json','data/error-prevention-registry.json','data/golden-components.json','scripts/quality-governance.js','scripts/quality-event.js','scripts/propagate-golden-components.js','data/app-capabilities.json'];
let bad=false;
for(const p of required)if(!fs.existsSync(path.join(ROOT,p))){console.error('[QUALITY_CHECK] missing',p);bad=true;}
if(bad)process.exit(1);
const er=JSON.parse(fs.readFileSync(path.join(ROOT,'data/error-prevention-registry.json'),'utf8')),seen=new Set();
for(const e of er.knownErrors||[]){if(!e.id||seen.has(e.id)){console.error('[QUALITY_CHECK] duplicate/invalid error id',e.id);bad=true;}seen.add(e.id);if(!e.protection?.length){console.error('[QUALITY_CHECK] no protection',e.id);bad=true;}}
const gr=JSON.parse(fs.readFileSync(path.join(ROOT,'data/golden-components.json'),'utf8'));
for(const [id,c] of Object.entries(gr.components||{}))if(c.status==='golden'&&!c.canonical){console.error('[QUALITY_CHECK] golden without canonical',id);bad=true;}
if(bad)process.exit(1);
cp.execFileSync(process.execPath,[path.join(ROOT,'scripts/quality-governance.js')],{stdio:'inherit'});
console.log('[QUALITY_CHECK] PASS');
