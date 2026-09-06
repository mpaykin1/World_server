#!/usr/bin/env node
'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const path=require('path'),{localStats,maturedReward}=require('../scripts/science-h2-delayed-local-reward.cjs');
const result=JSON.parse(fs.readFileSync(path.join(__dirname,'..','SCIENCE_RUN_070_H2.json'),'utf8'));
test('RUN_070 evidence has no UTF-8 BOM',()=>{const b=fs.readFileSync(path.join(__dirname,'..','SCIENCE_RUN_070_H2.json'));assert.notDeepEqual([...b.subarray(0,3)],[0xEF,0xBB,0xBF]);});
test('RUN_070 preregistration is immutable and result preserved',()=>{assert.deepEqual(result.preregistration.holdoutSeeds,[70111,70117,70141,70157,70181,70207]);assert.equal(result.pass,false);});
test('RUN_070 delayed reward stays local',()=>{const a=new Set(['0,0','4,0']),b=new Set([...a,'400,400','404,400']);assert.deepEqual(localStats(a,0,0),localStats(b,0,0));assert.equal(maturedReward(a,{x:0,z:0}),maturedReward(b,{x:0,z:0}));});
test('RUN_070 negative result is scientifically valid',()=>{assert.equal(result.summary.recovered,2);assert.equal(result.summary.beatsFixed,1);assert.ok(result.summary.meanLift<0);assert.equal(result.summary.controlLow,6);assert.equal(result.summary.multiRule,6);});
