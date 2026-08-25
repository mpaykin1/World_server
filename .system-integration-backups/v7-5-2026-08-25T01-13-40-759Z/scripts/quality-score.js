#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),sp=path.join(ROOT,'data/quality-scorecard.json'),ep=path.join(ROOT,'data/quality-evidence.json');
const [cmd,id,valueRaw,evidenceId,...noteParts]=process.argv.slice(2);
if(cmd!=='improve'||!id||valueRaw==null||!evidenceId){
  throw new Error('usage: node scripts/quality-score.js improve <metric-or-tech-id> <new-percent> <evidence-id> [note]');
}
const next=Number(valueRaw); if(!Number.isFinite(next)||next<0||next>100)throw new Error('percent must be 0..100');
const s=JSON.parse(fs.readFileSync(sp,'utf8')),e=JSON.parse(fs.readFileSync(ep,'utf8'));
let current,kind;
if(s.metrics?.[id]){current=Number(s.metrics[id].percent);kind='metric';}
else if(Object.prototype.hasOwnProperty.call(s.technologyUsage||{},id)){current=Number(s.technologyUsage[id]);kind='technology';}
else throw new Error(`unknown metric/technology id: ${id}`);
if(next<current)throw new Error(`NO REGRESSION: ${id} cannot decrease ${current} -> ${next}`);
if(next===current)throw new Error(`no improvement: ${id} already ${current}`);
const note=noteParts.join(' ')||'';
e.records=e.records||[];
if(e.records.some(x=>x.id===evidenceId))throw new Error(`duplicate evidence id: ${evidenceId}`);
e.records.push({id:evidenceId,type:'quality-improvement',kind,target:id,from:current,to:next,note,at:new Date().toISOString()});
if(kind==='metric')s.metrics[id].percent=next;else s.technologyUsage[id]=next;
s.updatedAt=new Date().toISOString();
fs.writeFileSync(sp,JSON.stringify(s,null,2)+'\n');
fs.writeFileSync(ep,JSON.stringify(e,null,2)+'\n');
console.log(`[QUALITY_SCORE] ${id}: ${current}% -> ${next}% evidence=${evidenceId}`);
