'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const run63=require('../scripts/science-h4-high-capability-selective-escalation.cjs');
const run64=require('../scripts/science-h4-budgeted-json-escalation.cjs');
test('free-form qwen reasoning is rejected instead of misread as a verdict',()=>{const p=run63.parseCritic('We are given:\n- symptom\nthinking only');assert.equal(p.valid,false);assert.equal(p.verdict,null)});
test('structured JSON critic output is accepted only with required fields',()=>{assert.equal(run64.parseCritic('{"verdict":"REVISE","root_cause":"buffer truncation","fix":"increase maxBuffer"}').valid,true);assert.equal(run64.parseCritic('{"verdict":"REVISE"}').valid,false);assert.equal(run64.parseCritic('VERDICT: KEEP').valid,false)});
test('promotion criterion fails closed on cost or no triggered improvement',()=>{assert.equal(run64.passes({u:.04,q:0,n:0,er:0,costRatio:1.7},2,1),false);assert.equal(run64.passes({u:.04,q:0,n:0,er:0,costRatio:1.4},2,0),false);assert.equal(run64.passes({u:.04,q:0,n:0,er:0,costRatio:1.4},2,1),true)});
test('RUN_063 invalid execution and RUN_064 valid negative result remain preserved',()=>{const a=require('../RUN_063_H4_BLIND_HIGH_CAPABILITY_SELECTIVE_ESCALATION.json'),b=require('../RUN_064_H4_BLIND_BUDGETED_JSON_ESCALATION.json');assert.equal(a.executionPass,false);assert.equal(a.hypothesisPass,false);assert.equal(b.executionPass,true);assert.equal(b.hypothesisPass,false);assert.equal(b.pass,false);assert.equal(b.selectedTaskIds.length,2)});
