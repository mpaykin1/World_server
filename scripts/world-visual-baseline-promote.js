#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path'),cp=require('child_process');const ROOT=process.cwd();
const args=process.argv.slice(2),idx=args.indexOf('--approve'),id=idx>=0?String(args[idx+1]||''):'';
if(!id){console.error('Usage: node scripts/world-visual-baseline-promote.js --approve <candidate-id>');process.exit(2)}
let branch='';try{branch=cp.execFileSync('git',['branch','--show-current'],{cwd:ROOT,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim()}catch{}
if(['master','main'].includes(branch)&&!args.includes('--allow-master')){console.error('Refusing baseline mutation on master/main. Use an AI branch.');process.exit(2)}
const cf=path.join(ROOT,'WORLD_VISUAL_BASELINE_CANDIDATES.json'),bf=path.join(ROOT,'data','visual-baselines.json');
const c=JSON.parse(fs.readFileSync(cf,'utf8')),b=JSON.parse(fs.readFileSync(bf,'utf8'));const list=c.candidates||[];const cand=list.find(x=>String(x.id||x.name||'')===id);
if(!cand){console.error(`Candidate not found: ${id}`);process.exit(2)}
b.approvedBaselines=Array.isArray(b.approvedBaselines)?b.approvedBaselines:[];
if(!b.approvedBaselines.some(x=>String(x.id||x.name||'')===id))b.approvedBaselines.push({...cand,approvedAt:new Date().toISOString(),approvalMode:'explicit-human-or-operator-approval'});
fs.writeFileSync(bf,JSON.stringify(b,null,2)+'\n');console.log(`[WORLD_BASELINE_PROMOTE_V4] approved ${id}`);
