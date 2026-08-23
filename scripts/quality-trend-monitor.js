#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd(),load=r=>JSON.parse(fs.readFileSync(path.join(ROOT,r),'utf8'));
const history=load('data/quality-history.json');
const score=load('data/quality-scorecard.json');
const events=history.events||[];
const current=Object.fromEntries(Object.entries(score.metrics||{}).map(([k,v])=>[k,Number(v.percent)]));
const previous=events.length?events[events.length-1].metrics||{}:{};
const stagnant=[],regressed=[],improved=[];
for(const [k,v] of Object.entries(current)){
  const p=Number(previous[k]);
  if(!Number.isFinite(p))continue;
  if(v<p)regressed.push({metric:k,from:p,to:v,delta:v-p});
  else if(v===p)stagnant.push({metric:k,value:v});
  else improved.push({metric:k,from:p,to:v,delta:v-p});
}
const report={generatedAt:new Date().toISOString(),stagnant,regressed,improved};
fs.writeFileSync(path.join(ROOT,'QUALITY_TREND_REPORT.json'),JSON.stringify(report,null,2)+'\n');
console.log(`[QUALITY_TREND] improved=${improved.length} stagnant=${stagnant.length} regressed=${regressed.length}`);
if(regressed.length)process.exit(9);
