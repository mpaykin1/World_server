'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateQualityRegression}=require('../scripts/quality-regression-lib');

function base(){
 return {
  baseline:{baselineId:'b',metrics:{controls:98,collisions:98,menu:99},technologyUsage:{InstantMesh:35},releaseBlockerCount:0,protectedErrorIds:['inverted'],goldenLocks:{},certifiedApps:{},criticalTests:[]},
  scorecard:{metrics:{controls:{percent:98},collisions:{percent:98},menu:{percent:99}},technologyUsage:{InstantMesh:35}},
  errors:{knownErrors:[{id:'inverted',status:'protected',severity:'release-blocker'}]},
  golden:{components:{}},releaseRegistry:{apps:{}},migrations:{goldenMigrations:[]},existingFiles:[]
 };
}
test('mutation: one-point controls regression is rejected',()=>{const f=base();f.scorecard.metrics.controls.percent=97;assert.equal(evaluateQualityRegression(f).pass,false)});
test('mutation: protected error return is rejected',()=>{const f=base();f.errors.knownErrors[0].status='known';assert.equal(evaluateQualityRegression(f).pass,false)});
test('mutation: technology rollback is rejected',()=>{const f=base();f.scorecard.technologyUsage.InstantMesh=34;assert.equal(evaluateQualityRegression(f).pass,false)});
