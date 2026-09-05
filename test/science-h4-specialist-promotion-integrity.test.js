'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..'),read=n=>JSON.parse(fs.readFileSync(path.join(root,n),'utf8'));
test('real multi-model holdout preserves failed superiority result',()=>{const r=read('RUN_043_H4_REAL_MULTI_MODEL_ROUTING_AB.json');assert.equal(r.pass,false);assert.ok(r.delta.quality<0);assert.ok(r.delta.utility<0)});
test('two-sample evidence gate is still insufficient and preserves failure',()=>{const r=read('RUN_044_H4_EVIDENCE_GATED_SPECIALIST_ROUTING.json');assert.equal(r.superiorityPass,false);assert.equal(r.nonRegressionPass,false)});
test('three-task paired calibration blocks unstable specialist promotion',()=>{const r=read('RUN_045_H4_SPECIALIST_CALIBRATION_GATE.json');assert.equal(r.promoteQwen25,false);assert.equal(r.pass,true);assert.equal(r.pairs.length,3);assert.ok(r.pairs.some(x=>x.delta>0));assert.ok(r.pairs.filter(x=>x.delta<0).length>=2)});
