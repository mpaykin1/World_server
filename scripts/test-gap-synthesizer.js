#!/usr/bin/env node
'use strict';
const fs=require('fs'),path=require('path');
const ROOT=process.cwd();
const model=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-model.json'),'utf8'));
const state=JSON.parse(fs.readFileSync(path.join(ROOT,'data/quality-evidence-state.json'),'utf8'));
const gaps=[];
for(const [metric,m] of Object.entries(model.metrics||{})){
  for(const c of m.controls||[]){
    if(c.kind!=='test')continue;
    if(state.testTags?.[c.tag])continue;
    gaps.push({
      metric,tag:c.tag,weight:c.weight,
      suggestedFile:`e2e/auto-${c.tag}.spec.js`,
      acceptance:`Behavioral evidence for ${c.id}`
    });
  }
}
fs.writeFileSync(path.join(ROOT,'TEST_GAP_MANIFEST.json'),JSON.stringify({generatedAt:new Date().toISOString(),gaps},null,2)+'\n');
console.log(`[TEST_GAPS] ${gaps.length}`);
