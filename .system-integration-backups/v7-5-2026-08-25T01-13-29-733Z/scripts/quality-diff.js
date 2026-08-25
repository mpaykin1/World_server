#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),load=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const base=load('data/quality-baseline.json'),cur=load('data/quality-scorecard.json');
const rows=[];
for(const [id,b] of Object.entries(base.metrics||{})){
  const c=Number(cur.metrics?.[id]?.percent),d=c-Number(b);
  rows.push({id,label:cur.metrics?.[id]?.label||id,before:Number(b),now:c,delta:d});
}
let md='| Показатель | Было | Сейчас | Δ |\n|---|---:|---:|---:|\n';
for(const r of rows)md+=`| ${r.label} | ${r.before}% | ${r.now}% | ${r.delta>=0?'+':''}${r.delta}% |\n`;
fs.writeFileSync(path.join(ROOT,'QUALITY_DIFF.md'),md);
fs.writeFileSync(path.join(ROOT,'QUALITY_DIFF.json'),JSON.stringify({baselineId:base.baselineId,rows},null,2)+'\n');
console.log(md);
