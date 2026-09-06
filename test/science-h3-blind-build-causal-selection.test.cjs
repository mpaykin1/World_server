'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const run060=require('../scripts/science-h3-blind-build-causal-selection.cjs').run;
const run061=require('../scripts/science-h3-blind-build-causal-selection-v2.cjs').run;
test('RUN_060 negative result is preserved',()=>assert.equal(run060().pass,false));
test('RUN_061 selects relational family on all preregistered seeds',()=>{const r=run061();assert.equal(r.criterion.relationalWins,6)});
test('RUN_061 predicts held-out and causal interventions exactly',()=>{const r=run061();assert.ok(r.criterion.minHold>=.97);assert.ok(r.criterion.minInformative>=20);assert.ok(r.criterion.minIntervention>=.95)});
test('RUN_061 rejects no-change and shuffled-label controls',()=>{const r=run061();assert.ok(r.criterion.maxNoChangeControl<=.05);assert.ok(r.criterion.maxShuffledLabelControl<=.90)});
test('RUN_061 full preregistered criterion passes',()=>assert.equal(run061().pass,true));
