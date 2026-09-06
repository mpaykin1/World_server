'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const R=path.resolve(__dirname,'..');
for(const rel of ['scripts/science-h4-specialist-holdout-v2.cjs','scripts/science-h4-blind-specialist-holdout.cjs']){test(rel+' has no ground-truth leakage or client abort',()=>{const s=fs.readFileSync(path.join(R,rel),'utf8');assert.equal(s.includes('ROOT_CAUSE:${e.rootCause'),false);assert.equal(s.includes('PROTECTIONS:${'),false);assert.equal(s.includes('AbortController'),false);assert.match(s,/blindPrompt:true/);assert.match(s,/hypothesisPass:promote/);assert.equal(s.includes('pass:true'),false);});}
test('RUN_051 preserves falsification',()=>{const r=JSON.parse(fs.readFileSync(path.join(R,'RUN_051_H4_SPECIALIST_HOLDOUT_V2.json'),'utf8'));assert.equal(r.executionPass,true);assert.equal(r.hypothesisPass,false);assert.equal(r.pass,false);assert.equal(r.wins,1);assert.equal(r.winRate,.125);assert.ok(r.medianDelta<0);});
