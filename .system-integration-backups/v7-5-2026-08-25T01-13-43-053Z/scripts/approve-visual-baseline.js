#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
if(process.env.VISUAL_BASELINE_APPROVED!=='YES')throw new Error('VISUAL_BASELINE_APPROVED=YES required');
const file=process.argv[2],id=process.argv[3];
if(!file||!id)throw new Error('usage: approve-visual-baseline <file> <id>');
const ROOT=process.cwd(),src=path.resolve(file);
if(!fs.existsSync(src))throw new Error('candidate screenshot missing');
const dest=path.join(ROOT,'visual-baselines',path.basename(src));
fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(src,dest);
const sha=crypto.createHash('sha256').update(fs.readFileSync(dest)).digest('hex');
const mp=path.join(ROOT,'data/visual-baselines.json'),m=JSON.parse(fs.readFileSync(mp,'utf8'));
m.approvedBaselines=m.approvedBaselines||[];
m.approvedBaselines=m.approvedBaselines.filter(x=>x.id!==id);
m.approvedBaselines.push({id,path:path.relative(ROOT,dest).replaceAll('\\','/'),sha256:sha,approvedAt:new Date().toISOString()});
fs.writeFileSync(mp,JSON.stringify(m,null,2)+'\n');
console.log(`[VISUAL_BASELINE] approved ${id} ${sha}`);
