'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {evaluateQualityRegression}=require('../scripts/quality-regression-lib');

function fixture(){
  return {
    baseline:{
      baselineId:'b1',metrics:{controls:55,graphics:52},technologyUsage:{Vercel:90},
      releaseBlockerCount:1,protectedErrorIds:['fixed-1'],
      goldenLocks:{controls:{canonical:'shared/runtime.js',status:'golden'}},
      certifiedApps:{game:{required:['mobile','collision'],visible:true,status:'certified'}},
      criticalTests:['test/a.test.js']
    },
    scorecard:{metrics:{controls:{percent:55},graphics:{percent:52}},technologyUsage:{Vercel:90}},
    errors:{knownErrors:[{id:'fixed-1',status:'protected',severity:'release-blocker'},{id:'open-1',status:'known',severity:'release-blocker'}]},
    golden:{components:{controls:{canonical:'shared/runtime.js',status:'golden'}}},
    releaseRegistry:{apps:{game:{required:['mobile','collision'],visible:true,status:'certified'}}},
    migrations:{goldenMigrations:[]},
    existingFiles:['test/a.test.js']
  };
}
test('equal baseline passes',()=>assert.equal(evaluateQualityRegression(fixture()).pass,true));
test('one metric drop fails even if another improves',()=>{
  const f=fixture();f.scorecard.metrics.controls.percent=54;f.scorecard.metrics.graphics.percent=100;
  const r=evaluateQualityRegression(f);assert.equal(r.pass,false);assert.ok(r.violations.some(v=>v.type==='metric-regression'&&v.id==='controls'));
});
test('technology integration cannot decrease',()=>{
  const f=fixture();f.scorecard.technologyUsage.Vercel=89;
  assert.ok(evaluateQualityRegression(f).violations.some(v=>v.type==='technology-regression'));
});
test('protected error cannot return',()=>{
  const f=fixture();f.errors.knownErrors.find(e=>e.id==='fixed-1').status='known';
  assert.ok(evaluateQualityRegression(f).violations.some(v=>v.type==='protected-error-unprotected'));
});
test('new release blocker fails',()=>{
  const f=fixture();f.errors.knownErrors.push({id:'new',status:'known',severity:'release-blocker'});
  assert.ok(evaluateQualityRegression(f).violations.some(v=>v.type==='release-blockers-increased'));
});
test('golden canonical cannot change silently',()=>{
  const f=fixture();f.golden.components.controls.canonical='shared/new.js';
  assert.ok(evaluateQualityRegression(f).violations.some(v=>v.type==='golden-canonical-changed-without-verified-migration'));
});
test('verified golden migration is allowed',()=>{
  const f=fixture();f.golden.components.controls.canonical='shared/new.js';
  f.migrations.goldenMigrations.push({componentId:'controls',from:'shared/runtime.js',to:'shared/new.js',verified:true});
  assert.equal(evaluateQualityRegression(f).pass,true);
});
test('certified app cannot lose required feature',()=>{
  const f=fixture();f.releaseRegistry.apps.game.required=['mobile'];
  assert.ok(evaluateQualityRegression(f).violations.some(v=>v.type==='certified-capability-removed'));
});
test('critical regression test cannot disappear',()=>{
  const f=fixture();f.existingFiles=[];
  assert.ok(evaluateQualityRegression(f).violations.some(v=>v.type==='critical-test-removed'));
});
